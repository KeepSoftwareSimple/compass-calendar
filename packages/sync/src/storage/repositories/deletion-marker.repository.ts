import { type Collection, type Db, ObjectId } from "mongodb";
import { type SyncEventCalendarId } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderEventId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  DeletionMarkerReadSchema,
  type DeletionMarkerRecord,
  type DeletionMarkerRecordInput,
  DeletionMarkerRecordInputSchema,
} from "@sync/storage/contracts/deletion-marker.contracts";

// Confirmed deletions are remembered for 30 days, after which the TTL index
// removes the marker.
export const DELETION_MARKER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Repository for `deletion_markers`. Recording a deletion is idempotent on the
// provider event identity, so a re-confirmed deletion refreshes rather than
// duplicates. `exists` lets delayed sync work skip re-creating a deleted event.
export class DeletionMarkerRepository {
  private readonly collection: Collection<DeletionMarkerRecord>;

  constructor(db: Db) {
    this.collection = db.collection<DeletionMarkerRecord>(
      SYNC_COLLECTIONS.deletionMarkers,
    );
  }

  async record(
    input: DeletionMarkerRecordInput,
  ): Promise<DeletionMarkerRecord> {
    const fields = DeletionMarkerRecordInputSchema.parse(input);
    const expiresAt = new Date(
      fields.deletedAt.getTime() + DELETION_MARKER_RETENTION_MS,
    );

    const result = await this.collection.findOneAndUpdate(
      {
        connectionId: fields.connectionId,
        calendarId: fields.calendarId,
        // $type: see the PLANNER TRAP note in index-manifest.ts.
        providerEventId: { $eq: fields.providerEventId, $type: "string" },
      },
      {
        $set: {
          providerVersion: fields.providerVersion,
          deletionSource: fields.deletionSource,
          deletedAt: fields.deletedAt,
          expiresAt,
        },
        $setOnInsert: {
          _id: new ObjectId().toHexString(),
          tenantId: fields.tenantId,
          principalId: fields.principalId,
          connectionId: fields.connectionId,
          calendarId: fields.calendarId,
          providerEventId: fields.providerEventId,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!result) throw new Error("record did not return a deletion marker");
    return DeletionMarkerReadSchema.parse(result);
  }

  async exists(
    connectionId: ConnectionId,
    calendarId: SyncEventCalendarId,
    providerEventId: ProviderEventId,
  ): Promise<boolean> {
    const count = await this.collection.countDocuments(
      {
        connectionId,
        calendarId,
        // $type: see the PLANNER TRAP note in index-manifest.ts.
        providerEventId: { $eq: providerEventId, $type: "string" },
      },
      { limit: 1 },
    );
    return count > 0;
  }

  // Hard-delete every deletion marker for one connection (retention).
  async deleteByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({
      tenantId,
      principalId,
      connectionId,
    });
    return result.deletedCount;
  }

  // Hard-delete every deletion marker for a principal (account deletion).
  async deleteByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, principalId });
    return result.deletedCount;
  }
}
