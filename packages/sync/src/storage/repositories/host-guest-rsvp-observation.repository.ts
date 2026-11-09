import {
  type AnyBulkWriteOperation,
  type Collection,
  type Db,
  ObjectId,
} from "mongodb";
import { type DetectedHostGuestRsvpReply } from "@core/booking/host-guest-rsvp-reply.util";
import { type EventId } from "@core/types/domain-primitives";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  type HostGuestRsvpObservationRecord,
  HostGuestRsvpObservationRecordSchema,
} from "@sync/storage/contracts/host-guest-rsvp-observation.contracts";

export type HostGuestRsvpObservationInsert = {
  tenantId: TenantId;
  principalId: PrincipalId;
  eventId: EventId;
  reply: DetectedHostGuestRsvpReply;
  firstObservedAt: Date;
};

export class HostGuestRsvpObservationRepository {
  private readonly collection: Collection<HostGuestRsvpObservationRecord>;

  constructor(db: Db) {
    this.collection = db.collection<HostGuestRsvpObservationRecord>(
      SYNC_COLLECTIONS.hostGuestRsvpObservations,
    );
  }

  async recordReplies(
    inserts: readonly HostGuestRsvpObservationInsert[],
  ): Promise<void> {
    if (inserts.length === 0) return;

    const ops: AnyBulkWriteOperation<HostGuestRsvpObservationRecord>[] = [];
    for (const row of inserts) {
      const { reply } = row;
      ops.push({
        updateOne: {
          filter: {
            tenantId: row.tenantId,
            principalId: row.principalId,
            eventId: row.eventId,
            guestEmailLower: reply.guestEmailLower,
            responseStatus: reply.status,
          },
          update: {
            $setOnInsert: {
              _id: new ObjectId(),
              tenantId: row.tenantId,
              principalId: row.principalId,
              eventId: row.eventId,
              guestEmailLower: reply.guestEmailLower,
              guestName: reply.guestName,
              responseStatus: reply.status,
              slotStart: new Date(reply.slotStart),
              firstObservedAt: row.firstObservedAt,
            },
          },
          upsert: true,
        },
      });
    }

    await this.collection.bulkWrite(ops, { ordered: false });
  }

  async summarizeSince(
    principalId: PrincipalId,
    cursor: { firstObservedAt: Date; observationId?: ObjectId },
  ): Promise<{ count: number; latest: HostGuestRsvpObservationRecord | null }> {
    const actionAfterCursor = cursor.observationId
      ? {
          $or: [
            { firstObservedAt: { $gt: cursor.firstObservedAt } },
            {
              firstObservedAt: cursor.firstObservedAt,
              _id: { $gt: cursor.observationId },
            },
          ],
        }
      : { firstObservedAt: { $gt: cursor.firstObservedAt } };

    const [summary] = await this.collection
      .aggregate<{ count: number; latest: HostGuestRsvpObservationRecord }>([
        {
          $match: {
            principalId,
            ...actionAfterCursor,
          },
        },
        { $sort: { firstObservedAt: 1, _id: 1 } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            latest: { $last: "$$ROOT" },
          },
        },
      ])
      .toArray();

    if (!summary) {
      return { count: 0, latest: null };
    }

    return {
      count: summary.count,
      latest: HostGuestRsvpObservationRecordSchema.parse(summary.latest),
    };
  }
}
