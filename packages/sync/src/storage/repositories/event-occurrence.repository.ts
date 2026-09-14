import { type Collection, type Db, type MongoClient, ObjectId } from "mongodb";
import { type EventId } from "@core/types/domain-primitives";
import { type SyncEventCalendarId } from "@core/types/sync/event.contracts";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  type EventOccurrenceRecord,
  EventOccurrenceRecordSchema,
} from "@sync/storage/contracts/event-occurrence.contracts";

export type OccurrenceInput = Omit<EventOccurrenceRecord, "_id">;

// Longest occurrence start we still consider when answering a busy or grid
// overlap window. Keeps calendar_gen_start range-bounded; see
// listBusyOverlapping and listByCalendarRange.
export const BUSY_MAX_LOOKBACK_MS = 366 * 24 * 60 * 60 * 1000;

export interface OccurrenceRangeCursor {
  startAt: Date;
  id: string;
}

// One calendar to read, paired with the generation whose occurrences are
// currently active for it — so a repair building a new generation alongside the
// live one is never read until it activates.
export interface CalendarGeneration {
  calendarId: SyncEventCalendarId;
  generation: number;
}

export interface OccurrenceRangeQuery {
  tenantId: TenantId;
  principalId: PrincipalId;
  calendars: readonly CalendarGeneration[];
  // Half-open display window [start, end). An occurrence matches when it
  // starts inside the window, or when it started earlier (within lookback)
  // and its [startAt, endAt) interval still overlaps the window.
  start: Date;
  end: Date;
  limit: number;
  after?: OccurrenceRangeCursor;
}

export interface BusyOverlapQuery {
  tenantId: TenantId;
  principalId: PrincipalId;
  calendars: readonly CalendarGeneration[];
  // Half-open window [start, end); an occurrence overlaps it when it starts
  // before `end` and ends after `start`.
  start: Date;
  end: Date;
}

// One busy occurrence's normalized half-open interval — the only fields a busy
// query needs. Titles and other content are never read here. calendarId is
// included so a multi-calendar busy query can attribute intervals without a
// second pass.
export interface OccurrenceInterval {
  startAt: Date;
  endAt: Date;
  eventId: EventId;
  calendarId: SyncEventCalendarId;
}

// Repository for `event_occurrences`. Rebuilding a series' window
// replaces exactly that event's occurrences for the given generation, so a
// series edit rebuilds only the affected horizon. The range query is the
// bounded, keyset-paginated display projection.
export class EventOccurrenceRepository {
  private readonly collection: Collection<EventOccurrenceRecord>;

  // The client is needed to run the rebuild atomically in a transaction.
  constructor(
    db: Db,
    private readonly client: MongoClient,
  ) {
    this.collection = db.collection<EventOccurrenceRecord>(
      SYNC_COLLECTIONS.eventOccurrences,
    );
  }

  // Replace all occurrences for one event within a generation, atomically.
  // The delete+insert runs in a transaction so a concurrent range query never
  // observes the mid-rebuild empty window, and a failed insert rolls the delete
  // back (no lost occurrences). Scoped to (eventId, generation), so occurrences
  // of other events — and of the same event in another generation being built
  // by a repair — are never touched (never delete an old generation before its
  // replacement completes).
  async replaceForEvent(
    eventId: EventId,
    generation: number,
    occurrences: OccurrenceInput[],
  ): Promise<void> {
    await this.replaceForEvents([{ eventId, generation, occurrences }]);
  }

  // Batched form of replaceForEvent: every entry's delete+insert runs in ONE
  // transaction instead of one per event. A single-event import page can touch
  // thousands of events, and a separate Mongo transaction per event (each its
  // own commit round-trip) was the dominant cost of an initial import — see
  // provider-page-applier.ts, which accumulates a page's projections and
  // flushes them through this method in chunks (bounded by the caller so one
  // transaction never approaches Atlas's 60s transaction lifetime limit).
  // Same per-event safety as replaceForEvent: each entry is scoped to its own
  // (eventId, generation), so entries never touch each other's rows; grouping
  // them in one transaction only changes when the commit happens, not what
  // becomes visible together.
  async replaceForEvents(
    entries: readonly {
      eventId: EventId;
      generation: number;
      occurrences: OccurrenceInput[];
    }[],
  ): Promise<void> {
    if (entries.length === 0) return;

    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Delete-then-insert PER ENTRY (not a batched delete phase followed by
        // a batched insert phase): if the same (eventId, generation) somehow
        // appeared twice in one call, a split-phase delete-all-then-insert-all
        // would silently duplicate that event's rows, since the second entry's
        // delete would find nothing left to remove. Interleaving keeps the
        // same one-transaction win (a single commit) without that risk.
        for (const entry of entries) {
          await this.collection.deleteMany(
            { eventId: entry.eventId, generation: entry.generation },
            { session },
          );
          if (entry.occurrences.length === 0) continue;
          const docs = entry.occurrences.map((occurrence) =>
            EventOccurrenceRecordSchema.parse({
              _id: new ObjectId().toHexString(),
              ...occurrence,
            }),
          );
          await this.collection.insertMany(docs, { session });
        }
      });
    } finally {
      await session.endSession();
    }
  }

  // Drop every occurrence of a calendar below a generation. A completed repair
  // uses this to garbage-collect the generations it replaced once reads have
  // moved to the new one — including the previously-active generation and any
  // orphaned intermediate generations left by earlier interrupted repairs.
  // Owner-scoped and idempotent.
  async deleteByCalendarBelowGeneration(
    tenantId: TenantId,
    principalId: PrincipalId,
    calendarId: SyncEventCalendarId,
    generation: number,
  ): Promise<void> {
    await this.collection.deleteMany({
      tenantId,
      principalId,
      calendarId,
      generation: { $lt: generation },
    });
  }

  // Hard-delete occurrences for the given calendars (post-disconnect retention).
  async deleteByCalendars(
    tenantId: TenantId,
    principalId: PrincipalId,
    calendarIds: readonly SyncEventCalendarId[],
  ): Promise<number> {
    if (calendarIds.length === 0) return 0;
    const result = await this.collection.deleteMany({
      tenantId,
      principalId,
      calendarId: { $in: [...calendarIds] },
    });
    return result.deletedCount;
  }

  // Hard-delete every occurrence for a principal (account deletion).
  async deleteByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, principalId });
    return result.deletedCount;
  }

  // Grid/display occurrences for [start, end). Matches start-in-range rows
  // (including zero-duration timed reminders) and earlier-starting rows whose
  // [startAt, endAt) still overlaps the window — so all-day events whose
  // startAt is UTC midnight still appear for west-of-UTC local-midnight
  // queries. startAt is lower-bounded by (windowStart - BUSY_MAX_LOOKBACK_MS)
  // so the calendar_gen_start index stays range-bounded, same as busy reads.
  async listByCalendarRange(
    query: OccurrenceRangeQuery,
  ): Promise<EventOccurrenceRecord[]> {
    if (query.calendars.length === 0) return [];
    const base = { tenantId: query.tenantId, principalId: query.principalId };
    // Read each calendar only at its active generation, so occurrences of a
    // repair building a newer generation for that calendar stay invisible until
    // it activates.
    const activeCalendars = {
      $or: query.calendars.map((c) => ({
        calendarId: c.calendarId,
        generation: c.generation,
      })),
    };
    const startAtFloor = new Date(query.start.getTime() - BUSY_MAX_LOOKBACK_MS);
    const inRange = {
      $or: [
        { startAt: { $gte: query.start, $lt: query.end } },
        {
          startAt: { $gte: startAtFloor, $lt: query.start },
          endAt: { $gt: query.start },
        },
      ],
    };

    // Composite keyset over the (startAt, _id) sort: a later instant, or the
    // same instant with a greater _id. startAt is a top-level Date and _id a
    // string, so this is fully typeable — no cast needed.
    const keyset = query.after
      ? [
          {
            $or: [
              { startAt: { $gt: query.after.startAt } },
              { startAt: query.after.startAt, _id: { $gt: query.after.id } },
            ],
          },
        ]
      : [];

    const filter = { ...base, $and: [activeCalendars, inRange, ...keyset] };

    const records = await this.collection
      .find(filter)
      .sort({ startAt: 1, _id: 1 })
      .limit(query.limit)
      .toArray();
    return records.map((r) => EventOccurrenceRecordSchema.parse(r));
  }

  // The busy occurrences overlapping [start, end) for the given calendars, each
  // read at its active generation, projected to just the interval. Overlap (not
  // start-in-range) so an occurrence that began before the window but ends inside
  // it is included. Cancelled occurrences are not busy and are excluded.
  //
  // `startAt` is also lower-bounded by (windowStart - BUSY_MAX_LOOKBACK_MS): an
  // unbounded `startAt < end` walks the entire historical calendar_gen_start
  // range on every busy query. Occurrences longer than the lookback are still
  // found when they start inside it; longer-than-lookback events are outside
  // Compass's practical horizon (multi-year single instances).
  async listBusyOverlapping(
    query: BusyOverlapQuery,
  ): Promise<OccurrenceInterval[]> {
    if (query.calendars.length === 0) return [];
    const startAtFloor = new Date(query.start.getTime() - BUSY_MAX_LOOKBACK_MS);
    const filter = {
      tenantId: query.tenantId,
      principalId: query.principalId,
      busy: true,
      cancelled: false,
      $and: [
        {
          $or: query.calendars.map((c) => ({
            calendarId: c.calendarId,
            generation: c.generation,
          })),
        },
        { startAt: { $gte: startAtFloor, $lt: query.end } },
        { endAt: { $gt: query.start } },
      ],
    };
    return this.collection
      .find(filter)
      .project<OccurrenceInterval>({
        startAt: 1,
        endAt: 1,
        eventId: 1,
        calendarId: 1,
        _id: 0,
      })
      .sort({ startAt: 1 })
      .toArray();
  }
}
