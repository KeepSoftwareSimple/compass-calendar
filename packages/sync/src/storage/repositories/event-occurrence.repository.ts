import {
  type ClientSession,
  type Collection,
  type Db,
  type Filter,
  type MongoClient,
  ObjectId,
} from "mongodb";
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

// Caps a single busy overlap read. A normal 60-day window stays under this;
// a pathological calendar fails closed via `truncated` instead of scanning
// without a bound.
export const BUSY_OVERLAP_DEFAULT_LIMIT = 5_000;

// insertMany / bulkWrite chunk. Occurrence rebuilds for a page can be a few
// thousand rows; 1000 stays inside the 500-1000 doc batch the Atlas round-trip
// budget wants without approaching the 16 MB command cap.
const INSERT_MANY_CHUNK = 1000;

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
  // Defaults to BUSY_OVERLAP_DEFAULT_LIMIT. The read fetches one extra row
  // so `truncated` is true when more overlaps exist than `limit`.
  limit?: number;
}

export interface BusyOverlapResult {
  intervals: OccurrenceInterval[];
  truncated: boolean;
}

// One busy occurrence's normalized half-open interval — the only fields a busy
// query needs. Titles and other content are never read here.
export interface OccurrenceInterval {
  startAt: Date;
  endAt: Date;
  eventId: EventId;
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

  // Batched form of replaceForEvent: every unique (eventId, generation) is
  // deleted once and its new rows inserted in one transaction, so a page of
  // hundreds of events is a handful of Mongo commands instead of two per event.
  // Duplicate (eventId, generation) entries keep the last — a split-phase
  // delete-all-then-insert-all would otherwise duplicate that event's rows.
  // An all-empty replacement skips the transaction when no occurrence rows
  // exist (the pull path otherwise opened a transaction to delete zero docs).
  async replaceForEvents(
    entries: readonly {
      eventId: EventId;
      generation: number;
      occurrences: OccurrenceInput[];
    }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const unique = lastOccurrenceEntry(entries);
    const filter = occurrenceEntryFilter(unique);
    const docs = unique.flatMap((entry) =>
      entry.occurrences.map((occurrence) =>
        EventOccurrenceRecordSchema.parse({
          _id: new ObjectId().toHexString(),
          ...occurrence,
        }),
      ),
    );

    if (docs.length === 0) {
      const exists = await this.collection.findOne(filter, {
        projection: { _id: 1 },
      });
      if (!exists) return;
      await this.collection.deleteMany(filter);
      return;
    }

    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        await this.collection.deleteMany(filter, { session });
        await insertManyChunked(this.collection, docs, session);
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
    const records = await this.collection
      .find(occurrenceRangeFilter(query))
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
  ): Promise<BusyOverlapResult> {
    if (query.calendars.length === 0) {
      return { intervals: [], truncated: false };
    }
    const limit = busyOverlapLimit(query.limit);
    const rows = await this.collection
      .find(busyOverlapFilter(query))
      .project<OccurrenceInterval>({
        startAt: 1,
        endAt: 1,
        eventId: 1,
        _id: 0,
      })
      .sort({ startAt: 1 })
      .limit(limit + 1)
      .toArray();
    const truncated = rows.length > limit;
    return {
      intervals: truncated ? rows.slice(0, limit) : rows,
      truncated,
    };
  }
}

// Shared with explain tests so the plan is the query the repository runs.
export function occurrenceRangeClause(
  query: Pick<OccurrenceRangeQuery, "start" | "end">,
): Filter<EventOccurrenceRecord> {
  const startAtFloor = new Date(query.start.getTime() - BUSY_MAX_LOOKBACK_MS);
  return {
    $or: [
      { startAt: { $gte: query.start, $lt: query.end } },
      {
        // endAt leads so calendar_gen_end can bound the overlap instead of
        // fetching every start inside the lookback.
        endAt: { $gt: query.start },
        startAt: { $gte: startAtFloor, $lt: query.start },
      },
    ],
  };
}

export function occurrenceRangeFilter(
  query: OccurrenceRangeQuery,
): Filter<EventOccurrenceRecord> {
  const activeCalendars = {
    $or: query.calendars.map((c) => ({
      calendarId: c.calendarId,
      generation: c.generation,
    })),
  };
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
  return {
    tenantId: query.tenantId,
    principalId: query.principalId,
    $and: [activeCalendars, occurrenceRangeClause(query), ...keyset],
  };
}

export function busyOverlapFilter(
  query: BusyOverlapQuery,
): Filter<EventOccurrenceRecord> {
  const startAtFloor = new Date(query.start.getTime() - BUSY_MAX_LOOKBACK_MS);
  return {
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
      {
        endAt: { $gt: query.start },
        startAt: { $gte: startAtFloor, $lt: query.end },
      },
    ],
  };
}

function busyOverlapLimit(limit: number | undefined): number {
  if (limit === undefined) return BUSY_OVERLAP_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("busy overlap limit must be a positive integer");
  }
  return limit;
}

type OccurrenceReplaceEntry = {
  eventId: EventId;
  generation: number;
  occurrences: OccurrenceInput[];
};

function lastOccurrenceEntry(
  entries: readonly OccurrenceReplaceEntry[],
): OccurrenceReplaceEntry[] {
  const unique = new Map<string, OccurrenceReplaceEntry>();
  for (const entry of entries) {
    unique.set(`${entry.eventId}:${entry.generation}`, entry);
  }
  return [...unique.values()];
}

function occurrenceEntryFilter(
  entries: readonly OccurrenceReplaceEntry[],
): Record<string, unknown> {
  const byGeneration = new Map<number, EventId[]>();
  for (const entry of entries) {
    const ids = byGeneration.get(entry.generation);
    if (ids) ids.push(entry.eventId);
    else byGeneration.set(entry.generation, [entry.eventId]);
  }
  if (byGeneration.size === 1) {
    const [generation, eventIds] = [...byGeneration][0] as [number, EventId[]];
    return { eventId: { $in: eventIds }, generation };
  }
  return {
    $or: entries.map((entry) => ({
      eventId: entry.eventId,
      generation: entry.generation,
    })),
  };
}

async function insertManyChunked(
  collection: Collection<EventOccurrenceRecord>,
  docs: EventOccurrenceRecord[],
  session: ClientSession,
): Promise<void> {
  for (let i = 0; i < docs.length; i += INSERT_MANY_CHUNK) {
    await collection.insertMany(docs.slice(i, i + INSERT_MANY_CHUNK), {
      session,
      ordered: false,
    });
  }
}
