import { type Collection, type Db, ObjectId } from "mongodb";
import {
  type ConnectionState,
  type ConnectionStateReason,
} from "@core/types/sync/connection.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { deriveDiagnosticKey } from "@sync/safety/diagnostic-key";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  ProviderConnectionReadSchema,
  type ProviderConnectionRecord,
  type ProviderConnectionUpsert,
  ProviderConnectionUpsertSchema,
} from "@sync/storage/contracts/provider-connection.contracts";

// Repository for `provider_connections`. Upserts are keyed on the
// stable provider-account identity so reconnecting the same account updates one
// document instead of creating a duplicate. Every query is scoped
// to a tenant/principal — one principal can never read another's connections.
export class ProviderConnectionRepository {
  private readonly collection: Collection<ProviderConnectionRecord>;

  constructor(db: Db) {
    this.collection = db.collection<ProviderConnectionRecord>(
      SYNC_COLLECTIONS.providerConnections,
    );
  }

  // Atomically create-or-update by (tenant, principal, provider, account). On
  // first sight Sync assigns _id and createdAt; on reconnect it updates the
  // mutable facts and leaves identity/creation untouched.
  async upsertByProviderAccount(
    input: ProviderConnectionUpsert,
  ): Promise<ProviderConnectionRecord> {
    const fields = ProviderConnectionUpsertSchema.parse(input);
    const now = new Date();
    const connectionId = new ObjectId().toHexString() as ConnectionId;

    const result = await this.collection.findOneAndUpdate(
      {
        tenantId: fields.tenantId,
        principalId: fields.principalId,
        provider: fields.provider,
        "account.providerAccountId": fields.account.providerAccountId,
      },
      {
        $set: {
          account: fields.account,
          capabilities: fields.capabilities,
          state: fields.state,
          stateReason: fields.stateReason,
          // A successful upsert-by-account-identity means the account is live —
          // a create or a reconnect — so clear any prior disconnect evidence.
          // This keeps disconnectedAt and state consistent: an upsert never
          // leaves a live state alongside a stale non-null disconnectedAt.
          disconnectedAt: null,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: connectionId,
          diagnosticKey: deriveDiagnosticKey(connectionId),
          tenantId: fields.tenantId,
          principalId: fields.principalId,
          provider: fields.provider,
          // Health timestamps are derived evidence, not link-time facts.
          // Putting them on $set would clobber lastHealthyAt on reconnect and
          // make an established account look like a first import.
          lastSyncedAt: null,
          lastHealthyAt: null,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      throw new Error("Upsert did not return a connection record");
    }
    return this.parseRecord(result);
  }

  // Global support lookup by non-user-facing diagnostic key. Callers must
  // already hold internal auth — this is not principal-scoped.
  async findByDiagnosticKey(
    diagnosticKey: string,
  ): Promise<ProviderConnectionRecord | null> {
    // $type makes the diagnostic_key partial index provable to the planner.
    // See the PLANNER TRAP note in index-manifest.ts.
    const record = await this.collection.findOne({
      diagnosticKey: { $eq: diagnosticKey, $type: "string" },
    });
    if (record) return this.parseRecord(record);

    // Pre-S45 rows omit diagnosticKey until first read; match derived keys.
    const hasLegacyRows = await this.collection.findOne(
      { diagnosticKey: { $not: { $type: "string" } } },
      { projection: { _id: 1 } },
    );
    if (!hasLegacyRows) return null;

    const legacyRows = await this.collection
      .find({ diagnosticKey: { $not: { $type: "string" } } })
      .toArray();
    for (const legacy of legacyRows) {
      const id = String(legacy._id) as ConnectionId;
      if (deriveDiagnosticKey(id) === diagnosticKey) {
        return this.parseRecord(legacy);
      }
    }
    return null;
  }

  async findById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: ConnectionId,
  ): Promise<ProviderConnectionRecord | null> {
    const record = await this.collection.findOne({
      _id: id,
      tenantId,
      principalId,
    });
    return record ? this.parseRecord(record) : null;
  }

  async listByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<ProviderConnectionRecord[]> {
    const records = await this.collection
      .find({ tenantId, principalId })
      .toArray();
    return Promise.all(records.map((r) => this.parseRecord(r)));
  }

  // Record that the user disconnected this connection. Sets the durable
  // `disconnectedAt` evidence and the terminal state together (they agree:
  // state derivation maps a non-null disconnectedAt to "disconnected"). Scoped
  // to the owning principal, and returns whether a row was actually updated so
  // the caller can tell a real disconnect from a missing/foreign connection.
  async markDisconnected(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: ConnectionId,
    now: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id, tenantId, principalId },
      {
        $set: {
          disconnectedAt: now,
          state: "disconnected",
          stateReason: null,
          updatedAt: now,
        },
      },
    );
    return result.matchedCount === 1;
  }

  // Persist a freshly derived user-facing state (and sync health timestamps).
  // Callers must pass a state already produced by deriveConnectionState — this
  // does not re-derive. Owner-scoped; returns the updated row.
  async updateDerivedState(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: ConnectionId,
    fields: {
      state: ConnectionState;
      stateReason: ConnectionStateReason | null;
      lastSyncedAt: Date | null;
      lastHealthyAt: Date | null;
    },
    now: Date = new Date(),
  ): Promise<ProviderConnectionRecord> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id, tenantId, principalId },
      {
        $set: {
          state: fields.state,
          stateReason: fields.stateReason,
          lastSyncedAt: fields.lastSyncedAt,
          lastHealthyAt: fields.lastHealthyAt,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (!result) {
      throw new Error("Connection not found while updating derived state");
    }
    return this.parseRecord(result);
  }

  // Stamp diagnosticKey on pre-S45 rows, then validate. Read paths share this
  // so support lookup and API reads never fail parse on legacy documents.
  private async parseRecord(
    record: ProviderConnectionRecord | Record<string, unknown>,
  ): Promise<ProviderConnectionRecord> {
    const id = String((record as { _id: ConnectionId })._id) as ConnectionId;
    if (
      typeof (record as { diagnosticKey?: unknown }).diagnosticKey !== "string"
    ) {
      const diagnosticKey = deriveDiagnosticKey(id);
      const stamped = await this.collection.findOneAndUpdate(
        { _id: id },
        { $set: { diagnosticKey } },
        { returnDocument: "after" },
      );
      if (!stamped) {
        throw new Error("Connection not found while stamping diagnostic key");
      }
      return ProviderConnectionReadSchema.parse(stamped);
    }
    return ProviderConnectionReadSchema.parse(record);
  }

  // Soft-disconnected connections whose disconnectedAt is strictly before
  // `before`, oldest first. Global scan for the retention sweeper (system
  // liveness, not a user request); each row carries its own owner ids.
  async listDisconnectedBefore(
    before: Date,
    limit: number,
  ): Promise<ProviderConnectionRecord[]> {
    // $type makes the disconnected_at partial index provable to the planner.
    // See the PLANNER TRAP note in index-manifest.ts.
    const records = await this.collection
      .find({ disconnectedAt: { $type: "date", $lt: before } })
      .sort({ disconnectedAt: 1 })
      .limit(limit)
      .toArray();
    return Promise.all(records.map((r) => this.parseRecord(r)));
  }

  // Hard-delete one connection row after its retained cache has been purged.
  async deleteById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: ConnectionId,
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      _id: id,
      tenantId,
      principalId,
    });
    return result.deletedCount === 1;
  }

  // Hard-delete only when the connection is still soft-disconnected and past
  // retention. Used by the sweeper so a reconnect during the purge window
  // does not delete a live connection row.
  async deleteIfDisconnectedBefore(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: ConnectionId,
    before: Date,
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      _id: id,
      tenantId,
      principalId,
      disconnectedAt: { $ne: null, $lt: before },
    });
    return result.deletedCount === 1;
  }

  // Hard-delete every connection for a principal (account deletion). Soft
  // disconnect uses markDisconnected instead; this removes the rows entirely.
  async deleteByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, principalId });
    return result.deletedCount;
  }
}
