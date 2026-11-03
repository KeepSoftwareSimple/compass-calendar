import { ReflectionReadRequestSchema } from "@core/types/sync/reflection.contracts";
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
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { describe, expect, it } from "bun:test";

describe("reflection historical reads", () => {
  const storage = setupSyncStorage(import.meta.url);
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
