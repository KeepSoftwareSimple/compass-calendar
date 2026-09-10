import { faker } from "@faker-js/faker";
import { type EventId } from "@core/types/domain-primitives";
import { type SyncEventCalendarId } from "@core/types/sync/event.contracts";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { mongoObjectId } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { queryBusyIntervals } from "@sync/domain/busy-query.service";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";

const objectId = () => faker.database.mongodbObjectId();
const WINDOW_START = new Date("2026-07-14T09:00:00.000Z");
const WINDOW_END = new Date("2026-07-14T17:00:00.000Z");

describe("queryBusyIntervals", () => {
  const storage = setupSyncStorage(import.meta.url);
  let occurrences: EventOccurrenceRepository;
  let tenantId: TenantId;
  let principalId: PrincipalId;
  let calendarA: SyncEventCalendarId;
  let calendarB: SyncEventCalendarId;

  beforeEach(() => {
    occurrences = new EventOccurrenceRepository(storage.db(), storage.client());
    tenantId = objectId() as TenantId;
    principalId = objectId() as PrincipalId;
    calendarA = objectId() as SyncEventCalendarId;
    calendarB = objectId() as SyncEventCalendarId;
  });

  // Insert a raw occurrence doc with only the fields the busy read touches.
  const seed = (input: {
    calendarId: SyncEventCalendarId;
    start: string;
    end?: string;
    generation?: number;
    busy?: boolean;
    cancelled?: boolean;
    eventId?: string;
  }) => {
    // Unique eventId + occurrenceKey per doc: the collection has a unique index
    // on (eventId, generation, occurrenceKey), so distinct seeds must not collide.
    const eventId = input.eventId ?? objectId();
    return storage
      .db()
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .insertOne({
        _id: mongoObjectId(objectId()),
        tenantId,
        principalId,
        eventId,
        occurrenceKey: `${eventId}:${input.start}`,
        calendarId: input.calendarId,
        generation: input.generation ?? 0,
        startAt: new Date(input.start),
        ...(input.end ? { endAt: new Date(input.end) } : {}),
        busy: input.busy ?? true,
        cancelled: input.cancelled ?? false,
      })
      .then(() => eventId);
  };

  const query = (
    calendars: Array<{ calendarId: SyncEventCalendarId; generation: number }>,
    excludeEventIds?: readonly EventId[],
  ) =>
    queryBusyIntervals(
      { occurrences },
      {
        tenantId,
        principalId,
        calendars,
        start: WINDOW_START,
        end: WINDOW_END,
        excludeEventIds,
      },
    );

  const iso = (intervals: { start: Date; end: Date }[]) =>
    intervals.map((i) => [i.start.toISOString(), i.end.toISOString()]);

  it("merges busy occurrences across calendars and keeps disjoint ones separate", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T09:00Z",
      end: "2026-07-14T10:00Z",
    });
    await seed({
      calendarId: calendarB,
      start: "2026-07-14T09:30Z",
      end: "2026-07-14T11:00Z",
    });
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T14:00Z",
      end: "2026-07-14T15:00Z",
    });

    const result = await query([
      { calendarId: calendarA, generation: 0 },
      { calendarId: calendarB, generation: 0 },
    ]);

    expect(iso(result)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T11:00:00.000Z"],
      ["2026-07-14T14:00:00.000Z", "2026-07-14T15:00:00.000Z"],
    ]);
  });

  it("includes and clamps an occurrence that overlaps the window start", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T08:00Z",
      end: "2026-07-14T09:30Z",
    });

    const result = await query([{ calendarId: calendarA, generation: 0 }]);

    // Clamped to the window start.
    expect(iso(result)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T09:30:00.000Z"],
    ]);
  });

  it("clamps an occurrence that overlaps the window end", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T16:30Z",
      end: "2026-07-14T18:00Z",
    });

    const result = await query([{ calendarId: calendarA, generation: 0 }]);

    expect(iso(result)).toEqual([
      ["2026-07-14T16:30:00.000Z", "2026-07-14T17:00:00.000Z"],
    ]);
  });

  it("reads each calendar only at its active generation", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T09:00Z",
      end: "2026-07-14T10:00Z",
      generation: 0,
    });
    // A newer generation being built by a repair must not be read.
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T12:00Z",
      end: "2026-07-14T13:00Z",
      generation: 1,
    });

    const result = await query([{ calendarId: calendarA, generation: 0 }]);

    expect(iso(result)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T10:00:00.000Z"],
    ]);
  });

  it("excludes cancelled occurrences", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T09:00Z",
      end: "2026-07-14T10:00Z",
      cancelled: true,
    });

    expect(await query([{ calendarId: calendarA, generation: 0 }])).toEqual([]);
  });

  it("excludes transparent (busy: false) occurrences", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T09:00Z",
      end: "2026-07-14T10:00Z",
      busy: false,
    });
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T11:00Z",
      end: "2026-07-14T12:00Z",
      busy: true,
    });

    expect(
      iso(await query([{ calendarId: calendarA, generation: 0 }])),
    ).toEqual([["2026-07-14T11:00:00.000Z", "2026-07-14T12:00:00.000Z"]]);
  });

  it("excludes an occurrence that has no endAt yet", async () => {
    // A pre-endAt occurrence (not yet reprojected) has no end to overlap on.
    await seed({ calendarId: calendarA, start: "2026-07-14T09:00Z" });

    expect(await query([{ calendarId: calendarA, generation: 0 }])).toEqual([]);
  });

  it("excludes an occurrence entirely outside the window", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T20:00Z",
      end: "2026-07-14T21:00Z",
    });

    expect(await query([{ calendarId: calendarA, generation: 0 }])).toEqual([]);
  });

  it("drops an excluded event before merge and keeps overlapping host busy", async () => {
    const bookingId = objectId();
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T10:00Z",
      end: "2026-07-14T11:00Z",
    });
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T10:00Z",
      end: "2026-07-14T10:30Z",
      eventId: bookingId,
    });

    const result = await query(
      [{ calendarId: calendarA, generation: 0 }],
      [bookingId as EventId],
    );

    expect(iso(result)).toEqual([
      ["2026-07-14T10:00:00.000Z", "2026-07-14T11:00:00.000Z"],
    ]);
  });

  it("ignores unknown excludeEventIds", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T10:00Z",
      end: "2026-07-14T11:00Z",
    });

    const result = await query(
      [{ calendarId: calendarA, generation: 0 }],
      [objectId() as EventId],
    );

    expect(iso(result)).toEqual([
      ["2026-07-14T10:00:00.000Z", "2026-07-14T11:00:00.000Z"],
    ]);
  });

  it("matches today's merge when excludeEventIds is empty or omitted", async () => {
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T09:00Z",
      end: "2026-07-14T10:00Z",
    });
    await seed({
      calendarId: calendarA,
      start: "2026-07-14T10:00Z",
      end: "2026-07-14T11:00Z",
    });

    const omitted = await query([{ calendarId: calendarA, generation: 0 }]);
    const empty = await query([{ calendarId: calendarA, generation: 0 }], []);

    expect(iso(omitted)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T11:00:00.000Z"],
    ]);
    expect(iso(empty)).toEqual(iso(omitted));
  });
});
