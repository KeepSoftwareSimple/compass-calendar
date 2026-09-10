import { faker } from "@faker-js/faker";
import { type Db } from "mongodb";
import {
  type CalendarId,
  type DateOnly,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type OccurrenceKey } from "@core/types/sync/event.contracts";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { type EventOccurrenceRecord } from "@sync/storage/contracts/event-occurrence.contracts";
import {
  BUSY_MAX_LOOKBACK_MS,
  EventOccurrenceRepository,
  type OccurrenceInput,
} from "@sync/storage/repositories/event-occurrence.repository";

const objectId = () => faker.database.mongodbObjectId();

const occurrence = (
  overrides: Partial<OccurrenceInput> = {},
): OccurrenceInput =>
  ({
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    eventId: objectId() as EventId,
    occurrenceKey: `${objectId()}:2026-07-14T09:00:00-06:00` as OccurrenceKey,
    calendarId: objectId() as CalendarId,
    schedule: {
      kind: "timed",
      start: "2026-07-14T09:00:00-06:00" as DateTime,
      end: "2026-07-14T10:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    },
    startAt: new Date("2026-07-14T09:00:00-06:00"),
    endAt: new Date("2026-07-14T10:00:00-06:00"),
    busy: true,
    title: "Standup",
    cancelled: false,
    generation: 0,
    ...overrides,
  }) as OccurrenceInput;

describe("EventOccurrenceRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;
  let repo: EventOccurrenceRepository;

  beforeEach(() => {
    db = storage.db();
    repo = new EventOccurrenceRepository(db, storage.client());
  });

  it("materializes occurrences for an event", async () => {
    const eventId = objectId() as OccurrenceInput["eventId"];
    await repo.replaceForEvent(eventId, 0, [
      occurrence({ eventId, occurrenceKey: `${eventId}:a` as OccurrenceKey }),
      occurrence({ eventId, occurrenceKey: `${eventId}:b` as OccurrenceKey }),
    ]);
    expect(await db.collection("event_occurrences").countDocuments()).toBe(2);
  });

  it("replaces only the target event's occurrences in that generation", async () => {
    const target = objectId() as OccurrenceInput["eventId"];
    const other = objectId() as OccurrenceInput["eventId"];
    await repo.replaceForEvent(target, 0, [
      occurrence({
        eventId: target,
        occurrenceKey: `${target}:old` as OccurrenceKey,
      }),
    ]);
    await repo.replaceForEvent(other, 0, [
      occurrence({
        eventId: other,
        occurrenceKey: `${other}:x` as OccurrenceKey,
      }),
    ]);

    // Rebuild the target with new occurrences; the other event is untouched.
    await repo.replaceForEvent(target, 0, [
      occurrence({
        eventId: target,
        occurrenceKey: `${target}:new1` as OccurrenceKey,
      }),
      occurrence({
        eventId: target,
        occurrenceKey: `${target}:new2` as OccurrenceKey,
      }),
    ]);

    const targetDocs = await db
      .collection("event_occurrences")
      .find({ eventId: target })
      .toArray();
    expect(targetDocs.map((d) => d["occurrenceKey"]).sort()).toEqual([
      `${target}:new1`,
      `${target}:new2`,
    ]);
    expect(
      await db
        .collection("event_occurrences")
        .countDocuments({ eventId: other }),
    ).toBe(1);
  });

  it("does not disturb another generation of the same event (non-destructive repair)", async () => {
    const eventId = objectId() as OccurrenceInput["eventId"];
    // The SAME occurrence (same eventId + occurrenceKey) in two generations: the
    // unique index includes generation, so a repair building generation 1 does
    // not collide with the live generation 0.
    const key = `${eventId}:instant` as OccurrenceKey;
    await repo.replaceForEvent(eventId, 0, [
      occurrence({ eventId, occurrenceKey: key, generation: 0 }),
    ]);
    await repo.replaceForEvent(eventId, 1, [
      occurrence({ eventId, occurrenceKey: key, generation: 1 }),
    ]);
    expect(
      await db.collection("event_occurrences").countDocuments({ eventId }),
    ).toBe(2);
  });

  it("clears occurrences when replaced with an empty set", async () => {
    const eventId = objectId() as OccurrenceInput["eventId"];
    await repo.replaceForEvent(eventId, 0, [
      occurrence({ eventId, occurrenceKey: `${eventId}:a` as OccurrenceKey }),
    ]);
    await repo.replaceForEvent(eventId, 0, []);
    expect(
      await db.collection("event_occurrences").countDocuments({ eventId }),
    ).toBe(0);
  });

  describe("replaceForEvents", () => {
    it("writes every entry's rows in one call, matching sequential replaceForEvent", async () => {
      const eventA = objectId() as OccurrenceInput["eventId"];
      const eventB = objectId() as OccurrenceInput["eventId"];
      const eventC = objectId() as OccurrenceInput["eventId"];

      await repo.replaceForEvents([
        {
          eventId: eventA,
          generation: 0,
          occurrences: [
            occurrence({
              eventId: eventA,
              occurrenceKey: `${eventA}:a1` as OccurrenceKey,
            }),
            occurrence({
              eventId: eventA,
              occurrenceKey: `${eventA}:a2` as OccurrenceKey,
            }),
          ],
        },
        {
          eventId: eventB,
          generation: 0,
          occurrences: [
            occurrence({
              eventId: eventB,
              occurrenceKey: `${eventB}:b1` as OccurrenceKey,
            }),
          ],
        },
        // An empty occurrence set (e.g. a fully-truncated recurring series)
        // must still clear any prior rows for that event.
        { eventId: eventC, generation: 0, occurrences: [] },
      ]);

      const docs = await db.collection("event_occurrences").find({}).toArray();
      expect(docs.map((d) => d["occurrenceKey"]).sort()).toEqual(
        [`${eventA}:a1`, `${eventA}:a2`, `${eventB}:b1`].sort(),
      );
    });

    it("replaces stale rows for every entry, not just the first", async () => {
      const eventA = objectId() as OccurrenceInput["eventId"];
      const eventB = objectId() as OccurrenceInput["eventId"];
      await repo.replaceForEvent(eventA, 0, [
        occurrence({
          eventId: eventA,
          occurrenceKey: `${eventA}:old` as OccurrenceKey,
        }),
      ]);
      await repo.replaceForEvent(eventB, 0, [
        occurrence({
          eventId: eventB,
          occurrenceKey: `${eventB}:old` as OccurrenceKey,
        }),
      ]);

      await repo.replaceForEvents([
        {
          eventId: eventA,
          generation: 0,
          occurrences: [
            occurrence({
              eventId: eventA,
              occurrenceKey: `${eventA}:new` as OccurrenceKey,
            }),
          ],
        },
        {
          eventId: eventB,
          generation: 0,
          occurrences: [
            occurrence({
              eventId: eventB,
              occurrenceKey: `${eventB}:new` as OccurrenceKey,
            }),
          ],
        },
      ]);

      const docs = await db.collection("event_occurrences").find({}).toArray();
      expect(docs.map((d) => d["occurrenceKey"]).sort()).toEqual(
        [`${eventA}:new`, `${eventB}:new`].sort(),
      );
    });

    it("is a no-op for an empty entry list", async () => {
      const eventId = objectId() as OccurrenceInput["eventId"];
      await repo.replaceForEvent(eventId, 0, [
        occurrence({
          eventId,
          occurrenceKey: `${eventId}:kept` as OccurrenceKey,
        }),
      ]);

      await repo.replaceForEvents([]);

      expect(
        await db.collection("event_occurrences").countDocuments({ eventId }),
      ).toBe(1);
    });
  });

  describe("listByCalendarRange", () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calA = objectId() as CalendarId;
    const calB = objectId() as CalendarId;

    beforeEach(async () => {
      const mk = (calendarId: string, day: number) =>
        occurrence({
          tenantId: tenantId as OccurrenceInput["tenantId"],
          principalId: principalId as OccurrenceInput["principalId"],
          eventId: objectId() as OccurrenceInput["eventId"],
          occurrenceKey: `${calendarId}:${day}` as OccurrenceKey,
          calendarId: calendarId as OccurrenceInput["calendarId"],
          schedule: {
            kind: "timed",
            start: `2026-07-${day}T09:00:00-06:00` as DateTime,
            end: `2026-07-${day}T10:00:00-06:00` as DateTime,
            timeZone: "America/Denver" as TimeZone,
          },
          startAt: new Date(`2026-07-${day}T09:00:00-06:00`),
        });
      const eventId = objectId() as OccurrenceInput["eventId"];
      await repo.replaceForEvent(eventId, 0, [
        mk(calA, 10),
        mk(calA, 14),
        mk(calB, 12),
        mk(calA, 20), // outside the query range below
      ]);
    });

    it("returns occurrences across multiple calendars in range, ordered", async () => {
      const page = await repo.listByCalendarRange({
        tenantId: tenantId as OccurrenceInput["tenantId"],
        principalId: principalId as OccurrenceInput["principalId"],
        calendars: [
          { calendarId: calA, generation: 0 },
          { calendarId: calB, generation: 0 },
        ],
        start: new Date("2026-07-01T00:00:00-06:00"),
        end: new Date("2026-07-16T00:00:00-06:00"),
        limit: 100,
      });
      expect(page).toHaveLength(3);
      const starts = page.map((o) => o.startAt.getTime());
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });

    it("paginates with the composite cursor", async () => {
      const query = {
        tenantId: tenantId as OccurrenceInput["tenantId"],
        principalId: principalId as OccurrenceInput["principalId"],
        calendars: [
          { calendarId: calA, generation: 0 },
          { calendarId: calB, generation: 0 },
        ],
        start: new Date("2026-07-01T00:00:00-06:00"),
        end: new Date("2026-07-16T00:00:00-06:00"),
      };
      const first = await repo.listByCalendarRange({ ...query, limit: 2 });
      const last = first[first.length - 1] as EventOccurrenceRecord;
      const second = await repo.listByCalendarRange({
        ...query,
        limit: 2,
        after: { startAt: last.startAt, id: last._id },
      });
      const ids = new Set([...first, ...second].map((o) => o._id));
      expect(first).toHaveLength(2);
      expect(second).toHaveLength(1);
      expect(ids.size).toBe(3);
    });

    it("paginates correctly across occurrences that share the same startAt", async () => {
      // Five occurrences at the SAME instant straddling page boundaries — the
      // (_id) tie-break in the composite cursor must not skip or repeat any.
      const tenant2 = objectId() as OccurrenceInput["tenantId"];
      const principal2 = objectId() as OccurrenceInput["principalId"];
      const cal = objectId() as CalendarId;
      const sameInstant = new Date("2026-07-14T09:00:00-06:00");
      const eventId = objectId() as OccurrenceInput["eventId"];
      await repo.replaceForEvent(
        eventId,
        0,
        Array.from({ length: 5 }, (_, i) =>
          occurrence({
            tenantId: tenant2,
            principalId: principal2,
            eventId,
            occurrenceKey: `${cal}:tie:${i}` as OccurrenceKey,
            calendarId: cal as OccurrenceInput["calendarId"],
            startAt: sameInstant,
          }),
        ),
      );

      const query = {
        tenantId: tenant2,
        principalId: principal2,
        calendars: [
          { calendarId: cal as OccurrenceInput["calendarId"], generation: 0 },
        ],
        start: new Date("2026-07-01T00:00:00-06:00"),
        end: new Date("2026-07-16T00:00:00-06:00"),
      };
      const seen: string[] = [];
      let after: { startAt: Date; id: string } | undefined;
      for (let i = 0; i < 10; i += 1) {
        const page = await repo.listByCalendarRange({
          ...query,
          limit: 2,
          after,
        });
        if (page.length === 0) break;
        for (const o of page) seen.push(o._id);
        const lastRow = page[page.length - 1];
        if (!lastRow) break;
        after = { startAt: lastRow.startAt, id: lastRow._id };
      }
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });

    it("reads only the requested generation, hiding a repair's new one", async () => {
      const tenant = objectId() as OccurrenceInput["tenantId"];
      const principal = objectId() as OccurrenceInput["principalId"];
      const cal = objectId() as OccurrenceInput["calendarId"];
      const at = new Date("2026-07-14T09:00:00-06:00");
      const mk = (eventId: string, gen: number, key: string) =>
        repo.replaceForEvent(eventId as OccurrenceInput["eventId"], gen, [
          occurrence({
            tenantId: tenant,
            principalId: principal,
            eventId: eventId as OccurrenceInput["eventId"],
            occurrenceKey: key as OccurrenceKey,
            calendarId: cal,
            startAt: at,
            generation: gen,
          }),
        ]);
      // The live generation 0 and a repair building generation 1 coexist.
      await mk(objectId(), 0, `${cal}:live`);
      await mk(objectId(), 1, `${cal}:repair`);

      const range = {
        start: new Date("2026-07-01T00:00:00-06:00"),
        end: new Date("2026-07-16T00:00:00-06:00"),
        limit: 100,
      };
      // Reading the active generation shows only the live row, never the repair.
      const live = await repo.listByCalendarRange({
        tenantId: tenant,
        principalId: principal,
        calendars: [{ calendarId: cal, generation: 0 }],
        ...range,
      });
      expect(live).toHaveLength(1);
      expect(live[0]?.occurrenceKey).toBe(`${cal}:live` as OccurrenceKey);
      // Reading generation 1 (post-activation) shows only the repair's row.
      const repaired = await repo.listByCalendarRange({
        tenantId: tenant,
        principalId: principal,
        calendars: [{ calendarId: cal, generation: 1 }],
        ...range,
      });
      expect(repaired).toHaveLength(1);
      expect(repaired[0]?.occurrenceKey).toBe(`${cal}:repair` as OccurrenceKey);
    });

    it("includes all-day UTC-midnight starts for America/Denver local-midnight windows", async () => {
      // All-day startAt is UTC midnight of the civil date. A Denver day view
      // sends local midnight (06:00Z), so startAt-only misses the row while a
      // same-day timed event still matches.
      const tenant = objectId() as OccurrenceInput["tenantId"];
      const principal = objectId() as OccurrenceInput["principalId"];
      const cal = objectId() as OccurrenceInput["calendarId"];
      const allDayEventId = objectId() as OccurrenceInput["eventId"];
      const timedEventId = objectId() as OccurrenceInput["eventId"];
      const zeroDurationEventId = objectId() as OccurrenceInput["eventId"];
      const priorAllDayEventId = objectId() as OccurrenceInput["eventId"];

      await repo.replaceForEvents([
        {
          eventId: allDayEventId,
          generation: 0,
          occurrences: [
            occurrence({
              tenantId: tenant,
              principalId: principal,
              eventId: allDayEventId,
              occurrenceKey: `${cal}:allday` as OccurrenceKey,
              calendarId: cal,
              title: "from gcal",
              schedule: {
                kind: "allDay",
                start: "2026-08-06" as DateOnly,
                end: "2026-08-07" as DateOnly,
              },
              startAt: new Date("2026-08-06T00:00:00.000Z"),
              endAt: new Date("2026-08-07T00:00:00.000Z"),
            }),
          ],
        },
        {
          eventId: timedEventId,
          generation: 0,
          occurrences: [
            occurrence({
              tenantId: tenant,
              principalId: principal,
              eventId: timedEventId,
              occurrenceKey: `${cal}:timed` as OccurrenceKey,
              calendarId: cal,
              title: "live sync???",
              schedule: {
                kind: "timed",
                start: "2026-08-06T11:30:00-06:00" as DateTime,
                end: "2026-08-06T13:00:00-06:00" as DateTime,
                timeZone: "America/Denver" as TimeZone,
              },
              startAt: new Date("2026-08-06T11:30:00-06:00"),
              endAt: new Date("2026-08-06T13:00:00-06:00"),
            }),
          ],
        },
        {
          eventId: zeroDurationEventId,
          generation: 0,
          occurrences: [
            occurrence({
              tenantId: tenant,
              principalId: principal,
              eventId: zeroDurationEventId,
              occurrenceKey: `${cal}:zero` as OccurrenceKey,
              calendarId: cal,
              title: "reminder",
              busy: false,
              schedule: {
                kind: "timed",
                start: "2026-08-06T15:00:00-06:00" as DateTime,
                end: "2026-08-06T15:00:00-06:00" as DateTime,
                timeZone: "America/Denver" as TimeZone,
              },
              startAt: new Date("2026-08-06T15:00:00-06:00"),
              endAt: new Date("2026-08-06T15:00:00-06:00"),
            }),
          ],
        },
        {
          eventId: priorAllDayEventId,
          generation: 0,
          occurrences: [
            occurrence({
              tenantId: tenant,
              principalId: principal,
              eventId: priorAllDayEventId,
              occurrenceKey: `${cal}:prior` as OccurrenceKey,
              calendarId: cal,
              title: "yesterday",
              schedule: {
                kind: "allDay",
                start: "2026-08-05" as DateOnly,
                end: "2026-08-06" as DateOnly,
              },
              startAt: new Date("2026-08-05T00:00:00.000Z"),
              endAt: new Date("2026-08-06T00:00:00.000Z"),
            }),
          ],
        },
      ]);

      const page = await repo.listByCalendarRange({
        tenantId: tenant,
        principalId: principal,
        calendars: [{ calendarId: cal, generation: 0 }],
        start: new Date("2026-08-06T00:00:00-06:00"),
        end: new Date("2026-08-07T00:00:00-06:00"),
        limit: 100,
      });
      const keys = page.map((o) => o.occurrenceKey).sort();
      expect(keys).toEqual([
        `${cal}:allday` as OccurrenceKey,
        `${cal}:timed` as OccurrenceKey,
        `${cal}:zero` as OccurrenceKey,
      ]);
    });
  });

  describe("listBusyOverlapping", () => {
    it("includes overlapping busy rows inside the lookback and skips older starts", async () => {
      const tenantId = objectId() as OccurrenceInput["tenantId"];
      const principalId = objectId() as OccurrenceInput["principalId"];
      const calendarId = objectId() as OccurrenceInput["calendarId"];
      const windowStart = new Date("2026-07-14T00:00:00.000Z");
      const windowEnd = new Date("2026-07-15T00:00:00.000Z");
      const inLookbackStart = new Date(
        windowStart.getTime() - BUSY_MAX_LOOKBACK_MS + 60_000,
      );
      const outOfLookbackStart = new Date(
        windowStart.getTime() - BUSY_MAX_LOOKBACK_MS - 60_000,
      );

      const eventIn = objectId() as OccurrenceInput["eventId"];
      const eventOut = objectId() as OccurrenceInput["eventId"];
      await repo.replaceForEvents([
        {
          eventId: eventIn,
          generation: 0,
          occurrences: [
            occurrence({
              tenantId,
              principalId,
              calendarId,
              eventId: eventIn,
              occurrenceKey: `${eventIn}:in` as OccurrenceKey,
              startAt: inLookbackStart,
              endAt: windowEnd,
              schedule: {
                kind: "timed",
                start: inLookbackStart.toISOString() as DateTime,
                end: windowEnd.toISOString() as DateTime,
                timeZone: "UTC" as TimeZone,
              },
            }),
          ],
        },
        {
          eventId: eventOut,
          generation: 0,
          occurrences: [
            occurrence({
              tenantId,
              principalId,
              calendarId,
              eventId: eventOut,
              occurrenceKey: `${eventOut}:out` as OccurrenceKey,
              startAt: outOfLookbackStart,
              endAt: windowEnd,
              schedule: {
                kind: "timed",
                start: outOfLookbackStart.toISOString() as DateTime,
                end: windowEnd.toISOString() as DateTime,
                timeZone: "UTC" as TimeZone,
              },
            }),
          ],
        },
      ]);

      const busy = await repo.listBusyOverlapping({
        tenantId,
        principalId,
        calendars: [{ calendarId, generation: 0 }],
        start: windowStart,
        end: windowEnd,
      });
      expect(busy).toEqual([
        { startAt: inLookbackStart, endAt: windowEnd, eventId: eventIn },
      ]);
    });
  });
});
