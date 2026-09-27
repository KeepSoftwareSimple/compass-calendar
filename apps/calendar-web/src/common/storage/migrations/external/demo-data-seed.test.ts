/**
 * Tests for the demo data seed migration.
 */
import { EventSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { createMockOfflineDataStore } from "@web/__tests__/utils/storage/mock-offline-data-store.util";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { DEMO_EVENT_IDS, demoDataSeedMigration } from "./demo-data-seed";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

describe("demoDataSeedMigration", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("seeds demo data when storage is empty", async () => {
    const store = createMockOfflineDataStore();

    await demoDataSeedMigration.migrate(store);

    expect(store.putEvents).toHaveBeenCalled();

    const eventsCall = store.putEvents.mock.calls[0][0] as LocalEventRecord[];
    // 7 today (unchanged) + 11 nearby-day events (2 + 3 + 3 + 3 across ±1/±2).
    expect(eventsCall).toHaveLength(18);
    expect(eventsCall.every((record) => record.isDemo)).toBe(true);
  });

  it("seeds tomorrow's Dentist/Team sync overlap at stable, targetable ids", async () => {
    const store = createMockOfflineDataStore();

    await demoDataSeedMigration.migrate(store);

    const eventsCall = store.putEvents.mock.calls[0][0] as LocalEventRecord[];
    const dentist = eventsCall.find(
      (record) => record.id === DEMO_EVENT_IDS.dentist,
    );
    const teamSync = eventsCall.find(
      (record) => record.id === DEMO_EVENT_IDS.teamSync,
    );
    const morningStandup = eventsCall.find(
      (record) => record.id === DEMO_EVENT_IDS.morningStandup,
    );

    expect(dentist?.event.content).toMatchObject({ title: "Dentist" });
    expect(teamSync?.event.content).toMatchObject({ title: "Team sync" });
    expect(morningStandup?.event.content).toMatchObject({
      title: "Morning standup",
    });

    if (
      dentist?.event.schedule.kind !== "timed" ||
      teamSync?.event.schedule.kind !== "timed"
    ) {
      throw new Error("expected timed schedules");
    }
    // Dentist (14:30-15:30) overlaps Team sync (14:00-15:00).
    expect(dentist.event.schedule.start < teamSync.event.schedule.end).toBe(
      true,
    );
    expect(teamSync.event.schedule.start < dentist.event.schedule.end).toBe(
      true,
    );
  });

  it("colors work blue, movement green, focus slate, and leaves the rest default", async () => {
    const store = createMockOfflineDataStore();

    await demoDataSeedMigration.migrate(store);

    const eventsCall = store.putEvents.mock.calls[0][0] as LocalEventRecord[];
    const colorsByTitle = new Map<string, (string | undefined)[]>();
    for (const { event } of eventsCall) {
      if (event.content.kind !== "details") continue;
      const list = colorsByTitle.get(event.content.title) ?? [];
      list.push(event.content.color ?? undefined);
      colorsByTitle.set(event.content.title, list);
    }

    expect(colorsByTitle.get("Gym")).toEqual(["green", "green"]);
    expect(colorsByTitle.get("Exercise")).toEqual(["green"]);
    expect(colorsByTitle.get("Team sync")).toEqual(["blue"]);
    expect(colorsByTitle.get("1:1 with Avery")).toEqual(["blue", "blue"]);
    expect(colorsByTitle.get("Design review")).toEqual(["blue", "blue"]);
    expect(colorsByTitle.get("Focus block")).toEqual(["slate", "slate"]);
    expect(colorsByTitle.get("Dentist")).toEqual([undefined]);
    expect(colorsByTitle.get("Lunch with Sam")).toEqual([undefined]);
    expect(colorsByTitle.get("Morning standup")).toEqual([undefined]);
  });

  it("skips seeding when events already exist", async () => {
    const store = createMockOfflineDataStore();
    store.getAllEvents.mockResolvedValue([{ id: "existing" }]);

    await demoDataSeedMigration.migrate(store);

    expect(store.putEvents).not.toHaveBeenCalled();
  });

  it("creates events with relative dates (not hardcoded)", async () => {
    const store = createMockOfflineDataStore();

    await demoDataSeedMigration.migrate(store);

    const eventsCall = store.putEvents.mock.calls[0][0] as LocalEventRecord[];
    const today = dayjs().toYearMonthDayString();

    const todayEvents = eventsCall.filter(
      ({ event }) =>
        event.schedule.kind === "timed" &&
        event.schedule.start.startsWith(today),
    );
    expect(todayEvents.length).toBeGreaterThan(0);
  });

  it("creates an all-day event for today", async () => {
    const store = createMockOfflineDataStore();

    await demoDataSeedMigration.migrate(store);

    const eventsCall = store.putEvents.mock.calls[0][0] as LocalEventRecord[];
    const allDayEvents = eventsCall.filter(
      ({ event }) => event.schedule.kind === "allDay",
    );

    expect(allDayEvents).toHaveLength(1);
    expect(allDayEvents[0].event.content).toMatchObject({
      title: "Deep work day",
    });
  });

  it("creates timed events with offset format and no seconds/milliseconds drift", async () => {
    const store = createMockOfflineDataStore();

    await demoDataSeedMigration.migrate(store);

    const eventsCall = store.putEvents.mock.calls[0][0] as LocalEventRecord[];
    const timedEvents = eventsCall.filter(
      ({ event }) => event.schedule.kind === "timed",
    );

    const offsetFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/;

    for (const { event } of timedEvents) {
      if (event.schedule.kind !== "timed") continue;
      expect(event.schedule.start).toMatch(offsetFormat);
      expect(event.schedule.end).toMatch(offsetFormat);
    }
  });

  it("seeds events with a valid Event shape", async () => {
    const store = createMockOfflineDataStore();

    await demoDataSeedMigration.migrate(store);

    const eventsCall = store.putEvents.mock.calls[0][0] as LocalEventRecord[];

    for (const { event } of eventsCall) {
      expect(() => EventSchema.parse(event)).not.toThrow();
    }
  });
});
