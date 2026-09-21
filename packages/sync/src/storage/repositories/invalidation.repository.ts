import { type Collection, type Db, ObjectId } from "mongodb";
import { type SyncInvalidation } from "@core/types/sync/change-feed.contracts";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  type InvalidationAppend,
  InvalidationAppendSchema,
  InvalidationReadSchema,
  type InvalidationRecord,
  InvalidationRecordSchema,
} from "@sync/storage/contracts/invalidation.contracts";

// Change-feed rows are retained long enough for a reconnecting API poller to
// resume; beyond this, GET /internal/changes returns resyncRequired.
export const INVALIDATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class InvalidationRepository {
  private readonly collection: Collection<InvalidationRecord>;

  constructor(db: Db) {
    this.collection = db.collection<InvalidationRecord>(
      SYNC_COLLECTIONS.invalidations,
    );
  }

  // Append one content-free invalidation. Best-effort relative to the domain
  // write that triggered it: callers invoke this after a successful commit so
  // a crash can drop the row (recovery is reconnect + refetch / resync).
  async append(input: InvalidationAppend): Promise<InvalidationRecord> {
    const fields = InvalidationAppendSchema.parse(input);
    const record: InvalidationRecord = InvalidationRecordSchema.parse({
      _id: new ObjectId().toHexString(),
      tenantId: fields.tenantId,
      principalId: fields.principalId,
      invalidation: fields.invalidation,
      emittedAt: fields.emittedAt,
      expiresAt: new Date(
        fields.emittedAt.getTime() + INVALIDATION_RETENTION_MS,
      ),
    });
    await this.collection.insertOne(record);
    return record;
  }

  async appendMany(
    tenantId: TenantId,
    principalId: PrincipalId,
    invalidations: readonly SyncInvalidation[],
    emittedAt: Date = new Date(),
  ): Promise<InvalidationRecord[]> {
    if (invalidations.length === 0) return [];

    const expiresAt = new Date(emittedAt.getTime() + INVALIDATION_RETENTION_MS);
    const records = invalidations.map((invalidation) =>
      InvalidationRecordSchema.parse({
        _id: new ObjectId().toHexString(),
        tenantId,
        principalId,
        invalidation,
        emittedAt,
        expiresAt,
      }),
    );
    await this.collection.insertMany(records);
    return records;
  }

  // Keyset page strictly after `afterId` for the signed principal. `afterId`
  // null means "from the beginning of retained history" — the route layer uses
  // latestId() as the "resume from now" watermark instead.
  async listAfter(
    tenantId: TenantId,
    principalId: PrincipalId,
    afterId: string | null,
    limit: number,
  ): Promise<InvalidationRecord[]> {
    const filter: Record<string, unknown> = { tenantId, principalId };
    if (afterId !== null) {
      filter["_id"] = { $gt: afterId };
    }
    const rows = await this.collection
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => InvalidationReadSchema.parse(row));
  }

  // Highest retained outbox id for the principal, or null when none exist.
  // Used as the "resume from now" watermark so a later append is always after
  // the cursor (avoids same-second ObjectId races with a freshly minted id).
  async latestId(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<string | null> {
    const row = await this.collection.findOne(
      { tenantId, principalId },
      { sort: { _id: -1 }, projection: { _id: 1 } },
    );
    return row?._id ?? null;
  }

  // Keyset page strictly after `afterId` across EVERY tenant/principal —
  // backs the single multiplexed change-feed poll the backend runs instead of
  // one poller per connected user (S-multiplex). Same semantics as
  // listAfter, just unscoped; the caller routes each row by its own
  // tenantId/principalId.
  async listAfterGlobal(
    afterId: string | null,
    limit: number,
  ): Promise<InvalidationRecord[]> {
    const filter: Record<string, unknown> = {};
    if (afterId !== null) {
      filter["_id"] = { $gt: afterId };
    }
    const rows = await this.collection
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => InvalidationReadSchema.parse(row));
  }

  // Highest retained outbox id across every tenant/principal, or null when
  // the outbox is empty. The global feed's "resume from now" watermark.
  async latestIdGlobal(): Promise<string | null> {
    const row = await this.collection.findOne(
      {},
      { sort: { _id: -1 }, projection: { _id: 1 } },
    );
    return row?._id ?? null;
  }

  // Hard-delete every invalidation for a principal (account deletion).
  async deleteByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, principalId });
    return result.deletedCount;
  }
}
