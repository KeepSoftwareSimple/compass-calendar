import {
  type ReflectionEvent,
  ReflectionReadRequestSchema,
} from "@core/types/sync/reflection.contracts";
import {
  fakeTokenSource,
  pageOf,
  seedProviderCalendar,
  singleEvent,
} from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { importCalendarEvents } from "@sync/domain/calendar-import.service";
import { readReflectionPage } from "@sync/domain/reflection-read.service";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { EventRecordSchema } from "@sync/storage/contracts/event.contracts";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { describe, expect, it } from "bun:test";

describe("reflection historical reads", () => {
  const storage = setupSyncStorage(import.meta.url);
  it("prunes unrelated history while retaining old singles, series and empty cursor pages", async () => {
    const db = storage.db();
    const calendar = await seedProviderCalendar(
      new ProviderCalendarRepository(db),
    );
    const now = new Date("2026-11-02T00:00:00Z");
    const records = Array.from({ length: 10_001 }, (_, index) => {
      const matching = index === 17 || index === 5003 || index === 10_000;
      return EventRecordSchema.parse({
        _id: String(index).padStart(24, "0"),
        tenantId: calendar.tenantId,
        principalId: calendar.principalId,
        origin: "provider",
        calendarId: calendar._id,
        clientEventId: null,
        connectionId: calendar.connectionId,
        providerEventId: `archive-${index}`,
        providerVersion: "v1",
        providerUpdatedAt: now,
        deliveryState: "confirmed",
        providerMetadata: null,
        content: singleEvent(`archive-${index}`, `Archived event ${index}`)
          .content,
        schedule: {
          kind: "timed",
          start: matching ? "2010-11-01T17:00:00Z" : "2018-08-01T16:00:00Z",
          end: matching ? "2010-11-01T18:00:00Z" : "2018-08-01T17:00:00Z",
          timeZone: "America/Denver",
        },
        recurrence:
          index === 5003
            ? { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] }
            : { kind: "single" },
        lifecycleState: "active",
        generation: 1,
        createdAt: now,
        updatedAt: now,
        confirmedAt: now,
      });
    });
    await db.collection(SYNC_COLLECTIONS.events).insertMany([
      ...records,
      EventRecordSchema.parse({
        ...records[17],
        _id: "foreign-history",
        principalId: "f".repeat(24),
        providerEventId: "foreign-history",
        schedule: {
          kind: "timed",
          start: "1900-11-01T17:00:00Z",
          end: "1900-11-01T18:00:00Z",
          timeZone: "America/Denver",
        },
      }),
    ]);
    const input = ReflectionReadRequestSchema.parse({
      calendarIds: [calendar._id],
      selfEmails: [],
      windows: [
        {
          key: "history:2010",
          start: "2010-11-01T00:00:00Z",
          end: "2010-12-01T00:00:00Z",
          startDate: "2010-11-01",
          endDate: "2010-12-01",
        },
      ],
    });
    const events: ReflectionEvent[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let emptyPages = 0;
    do {
      const page = await readReflectionPage(db, calendar, {
        ...input,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.truncated).toBe(false);
      expect(page.oldestYear).toBe(2010);
      expect(page.nextCursor).not.toBe(cursor);
      events.push(...page.events);
      if (!page.events.length) emptyPages++;
      cursor = page.nextCursor ?? undefined;
      pages++;
      expect(pages).toBeLessThan(1000);
    } while (cursor);
    expect(pages).toBe(1);
    expect(emptyPages).toBe(0);
    expect(events.map((event) => event.title).sort()).toEqual([
      "Archived event 10000",
      "Archived event 17",
      "Archived event 5003",
      "Archived event 5003",
      "Archived event 5003",
    ]);
    expect(new Set(events.map((event) => event.id)).size).toBe(5);
    expect(
      events
        .filter((event) => event.title === "Archived event 5003")
        .every((event) => event.routine),
    ).toBe(true);
    expect(
      events
        .filter((event) => !event.recurring)
        .every((event) => !event.routine),
    ).toBe(true);
    expect(
      await db.collection(SYNC_COLLECTIONS.eventOccurrences).countDocuments(),
    ).toBe(0);
    // Expired series remain candidates until recurrence projection can prove
    // they have no occurrences. Empty result pages must still advance cursors.
    await db.collection(SYNC_COLLECTIONS.events).insertMany(
      Array.from({ length: 51 }, (_, index) =>
        EventRecordSchema.parse({
          ...records[0],
          _id: `stale-${String(index).padStart(4, "0")}`,
          providerEventId: `stale-${index}`,
          schedule: {
            kind: "timed",
            start: "1990-01-01T17:00:00Z",
            end: "1990-01-01T18:00:00Z",
            timeZone: "America/Denver",
          },
          recurrence: {
            kind: "seriesMaster",
            rules: ["RRULE:FREQ=WEEKLY;COUNT=1"],
          },
        }),
      ),
    );
    let staleCursor: string | undefined = "stale-";
    let stalePages = 0;
    do {
      const page = await readReflectionPage(db, calendar, {
        ...input,
        cursor: staleCursor,
      });
      expect(page.events).toEqual([]);
      expect(page.nextCursor).not.toBe(staleCursor);
      staleCursor = page.nextCursor ?? undefined;
      stalePages++;
      expect(stalePages).toBeLessThan(5);
    } while (staleCursor);
    expect(stalePages).toBe(3);
  });

  it("paginates interleaved masters and scheduled facts without gaps or duplicates", async () => {
    const db = storage.db();
    const calendar = await seedProviderCalendar(
      new ProviderCalendarRepository(db),
    );
    const records: ProviderEvent[] = Array.from({ length: 51 }, (_, index) => ({
      ...singleEvent(`mixed-${index}`),
      schedule: {
        kind: "timed",
        start: "2010-11-01T17:00:00Z",
        end: "2010-11-01T18:00:00Z",
        timeZone: "America/Denver",
      },
      recurrence:
        index % 2
          ? { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY;COUNT=1"] }
          : { kind: "single" },
    }));
    await importCalendarEvents(
      {
        events: new EventRepository(db),
        occurrences: new EventOccurrenceRepository(db, storage.client()),
        resources: new SyncResourceRepository(db),
        custody: fakeTokenSource,
        reader: {
          listEventPage: async (input) =>
            input.window
              ? pageOf([])
              : pageOf(records, { nextSyncToken: "mixed" }),
        },
      },
      calendar,
      () => new Date("2026-11-02T00:00:00Z"),
    );
    const expected = await db
      .collection(SYNC_COLLECTIONS.events)
      .find({ calendarId: calendar._id })
      .sort({ _id: 1 })
      .toArray();
    const input = ReflectionReadRequestSchema.parse({
      calendarIds: [calendar._id],
      selfEmails: [],
      windows: [
        {
          key: "mixed",
          start: "2010-11-01T00:00:00Z",
          end: "2010-11-02T00:00:00Z",
          startDate: "2010-11-01",
          endDate: "2010-11-02",
        },
      ],
    });
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await readReflectionPage(db, calendar, {
        ...input,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.events.length).toBeLessThanOrEqual(25);
      expect(page.nextCursor).not.toBe(cursor);
      ids.push(...page.events.map((event) => event.eventId));
      cursor = page.nextCursor ?? undefined;
      expect(++pages).toBeLessThan(5);
    } while (cursor);
    expect(pages).toBe(3);
    expect(ids).toEqual(expected.map((event) => event._id));
    expect(new Set(ids).size).toBe(51);
  });

  it("preserves all-day and offset start boundaries while pruning unrelated schedules", async () => {
    const db = storage.db();
    const calendar = await seedProviderCalendar(
      new ProviderCalendarRepository(db),
    );
    const records: ProviderEvent[] = [
      {
        ...singleEvent("long"),
        schedule: { kind: "allDay", start: "2010-11-01", end: "2010-12-02" },
      },
      {
        ...singleEvent("offset"),
        schedule: {
          kind: "timed",
          start: "2010-10-31T23:30:00-08:00",
          end: "2010-11-01T00:30:00-08:00",
          timeZone: "America/Los_Angeles",
        },
      },
      {
        ...singleEvent("outside"),
        schedule: { kind: "allDay", start: "2010-09-01", end: "2010-09-02" },
      },
    ];
    await importCalendarEvents(
      {
        events: new EventRepository(db),
        occurrences: new EventOccurrenceRepository(db, storage.client()),
        resources: new SyncResourceRepository(db),
        custody: fakeTokenSource,
        reader: {
          listEventPage: async (input) =>
            input.window
              ? pageOf([])
              : pageOf(records, { nextSyncToken: "all" }),
        },
      },
      calendar,
      () => new Date("2026-11-02T00:00:00Z"),
    );
    const read = await readReflectionPage(
      db,
      calendar,
      ReflectionReadRequestSchema.parse({
        calendarIds: [calendar._id],
        selfEmails: [],
        windows: [
          {
            key: "edge",
            start: "2010-11-01T00:00:00Z",
            end: "2010-11-02T00:00:00Z",
            startDate: "2010-11-01",
            endDate: "2010-11-02",
          },
        ],
      }),
    );
    expect(read.events.map((event) => event.title).sort()).toEqual([
      "long",
      "offset",
    ]);
    expect(read.truncated).toBe(false);
    expect(read.nextCursor).toBeNull();
  });

  it("reads old singles and series exceptions beyond the interactive horizon without resurrecting cancellations", async () => {
    const db = storage.db();
    const calendar = await seedProviderCalendar(
      new ProviderCalendarRepository(db),
    );
    const schedule = {
      kind: "timed" as const,
      start: "2018-11-01T17:00:00Z",
      end: "2018-11-01T18:00:00Z",
      timeZone: "America/Denver",
    };
    const records: ProviderEvent[] = [
      { ...singleEvent("trip", "A memorable trip"), schedule },
      {
        ...singleEvent("series", "Weekly walk"),
        schedule,
        recurrence: {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=WEEKLY;COUNT=3"],
        },
      },
      ...["MONTHLY", "YEARLY"].map(
        (frequency): ProviderEvent => ({
          ...singleEvent(frequency, `${frequency} occasion`),
          schedule,
          recurrence: {
            kind: "seriesMaster",
            rules: [`RRULE:FREQ=${frequency};COUNT=3`],
          },
        }),
      ),
      {
        ...singleEvent("moved", "Walk with a friend"),
        schedule: {
          ...schedule,
          start: "2018-11-09T17:00:00Z",
          end: "2018-11-09T18:00:00Z",
        },
        recurrence: {
          kind: "instance",
          seriesProviderId: "series",
          recurrenceId: "2018-11-08T17:00:00Z",
        },
      },
    ];
    const resources = new SyncResourceRepository(db);
    const result = await importCalendarEvents(
      {
        events: new EventRepository(db),
        occurrences: new EventOccurrenceRepository(db, storage.client()),
        resources,
        custody: fakeTokenSource,
        reader: {
          supportsFullHistory: true,
          listEventPage: async (input) =>
            input.window
              ? pageOf([])
              : pageOf(records, { nextSyncToken: "all-history" }),
        },
      },
      calendar,
      () => new Date("2026-11-02T00:00:00Z"),
    );
    await resources.setBootstrapState(
      calendar.tenantId,
      calendar.principalId,
      result.resource._id,
      "ready",
    );
    const input = ReflectionReadRequestSchema.parse({
      calendarIds: [calendar._id],
      selfEmails: [],
      windows: [
        {
          key: "history:2018",
          start: "2018-11-01T00:00:00Z",
          end: "2018-12-01T00:00:00Z",
          startDate: "2018-11-01",
          endDate: "2018-12-01",
        },
      ],
    });
    const read = await readReflectionPage(db, calendar, input);
    expect(read.historyComplete).toBe(true);
    expect(read.oldestYear).toBe(2018);
    for (const frequency of ["MONTHLY", "YEARLY"]) {
      expect(
        read.events.find((event) => event.title === `${frequency} occasion`)
          ?.routine,
      ).toBe(false);
    }
    expect(
      read.events.find((event) => event.title === "Walk with a friend")
        ?.routine,
    ).toBe(true);
    expect(
      read.events.find((event) => event.title === "A memorable trip"),
    ).toBeDefined();
    expect(
      read.events.find((event) => event.title === "Walk with a friend")
        ?.schedule.start,
    ).toBe("2018-11-09T17:00:00Z");
    expect(
      read.events
        .filter((event) => event.title === "Weekly walk")
        .map((event) => event.schedule.start),
    ).not.toContain("2018-11-08T17:00:00.000Z");
    expect(
      await db.collection(SYNC_COLLECTIONS.eventOccurrences).countDocuments(),
    ).toBe(0);
    const other = await readReflectionPage(
      db,
      {
        tenantId: calendar.tenantId,
        principalId: "another-principal" as typeof calendar.principalId,
      },
      input,
    );
    expect(other.events).toEqual([]);
  });

  it("keeps certified active history available during a non-destructive refresh", async () => {
    const db = storage.db();
    const calendar = await seedProviderCalendar(
      new ProviderCalendarRepository(db),
    );
    const resources = new SyncResourceRepository(db);
    const record: ProviderEvent = {
      ...singleEvent("archive"),
      schedule: { kind: "allDay", start: "2018-11-01", end: "2018-11-02" },
    };
    const imported = await importCalendarEvents(
      {
        events: new EventRepository(db),
        occurrences: new EventOccurrenceRepository(db, storage.client()),
        resources,
        custody: fakeTokenSource,
        reader: {
          supportsFullHistory: true,
          listEventPage: async (input) =>
            input.window
              ? pageOf([])
              : pageOf([record], { nextSyncToken: "complete-archive" }),
        },
      },
      calendar,
      () => new Date("2026-11-05T00:00:00Z"),
    );
    await resources.setBootstrapState(
      calendar.tenantId,
      calendar.principalId,
      imported.resource._id,
      "ready",
    );
    const input = ReflectionReadRequestSchema.parse({
      calendarIds: [calendar._id],
      selfEmails: [],
      windows: [
        {
          key: "archive",
          start: "2018-11-01T00:00:00Z",
          end: "2018-11-02T00:00:00Z",
          startDate: "2018-11-01",
          endDate: "2018-11-02",
        },
      ],
    });
    const before = await readReflectionPage(db, calendar, input);
    expect(before.historyComplete).toBe(true);
    expect(before.events).toHaveLength(1);
    const staging = await resources.startNewGeneration(
      calendar.tenantId,
      calendar.principalId,
      imported.resource._id,
    );
    expect(staging).toBeGreaterThan(imported.resource.activeGeneration);
    const during = await readReflectionPage(db, calendar, input);
    expect(during.events).toEqual(before.events);
    expect(during.historyComplete).toBe(true);
    // A verified skipped-read failure still invalidates the certificate.
    await resources.recordHistoryCoverage(
      imported.resource,
      1,
      true,
      new Date(),
    );
    expect(
      (await readReflectionPage(db, calendar, input)).historyComplete,
    ).toBe(false);
  });

  it("does not treat a legacy cursor as proof of historical coverage", async () => {
    const db = storage.db();
    const calendar = await seedProviderCalendar(
      new ProviderCalendarRepository(db),
    );
    const resources = new SyncResourceRepository(db);
    const resource = await resources.ensure({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      connectionId: calendar.connectionId,
      calendarId: calendar._id,
      resourceKind: "events",
    });
    await resources.advanceCursor(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      "legacy-cursor",
      new Date(),
    );
    const read = await readReflectionPage(
      db,
      calendar,
      ReflectionReadRequestSchema.parse({
        calendarIds: [calendar._id],
        selfEmails: [],
        windows: [],
      }),
    );
    expect(read.historyComplete).toBe(false);
  });
});
