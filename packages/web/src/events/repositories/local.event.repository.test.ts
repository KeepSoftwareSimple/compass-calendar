import {
  type CalendarId,
  DateOnlySchema,
  DateTimeSchema,
  type EventId,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { decodeOccurrenceId } from "@core/util/occurrence-id";
import { createMockLocalEventRecord } from "@web/__tests__/utils/factories/event.factory";
import {
  type OfflineDataStore,
  resetOfflineDataStoreForTests,
} from "@web/common/storage/offline-data/offline-data.store.registry";
import { LocalEventRepository } from "@web/events/repositories/local.event.repository";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const putEvent = mock();
const getAllEvents = mock();
const deleteEvent = mock();

const fakeStore = {
  putEvent,
  getAllEvents,
  deleteEvent,
} as unknown as OfflineDataStore;

const repository = new LocalEventRepository(() => fakeStore);

describe("LocalEventRepository", () => {
  beforeEach(() => {
    putEvent.mockClear();
    getAllEvents.mockClear();
    deleteEvent.mockClear();
  });

  it("preserves the demo marker when replacing a seeded demo event", async () => {
    const existing = createMockLocalEventRecord({}, true);
    getAllEvents.mockResolvedValue([existing]);

    await repository.replace(existing.id, {
      content: {
        kind: "details",
        title: "Renamed sample",
        description: "",
        location: "",
      },
      schedule: existing.event.schedule,
      recurrence: { kind: "preserve" },
      scope: "this",
    });

    expect(putEvent.mock.calls[0][0].isDemo).toBe(true);
  });

  it("upserts (instead of throwing) when the edit target is absent from the store", async () => {
    // The optimistic layer can resolve an edit target from the query cache
    // that was never persisted to IndexedDB (e.g. a materialized recurring
    // occurrence). Replacing it must not throw "Event not found".
    getAllEvents.mockResolvedValue([]);

    const id = "c".repeat(24) as EventId;
    const result = await repository.replace(id, {
      content: { kind: "details", title: "x", description: "", location: "" },
      schedule: {
        kind: "timed",
        start: DateTimeSchema.parse("2026-05-05T09:00:00.000-05:00"),
        end: DateTimeSchema.parse("2026-05-05T10:00:00.000-05:00"),
        timeZone: TimeZoneSchema.parse("America/Chicago"),
      },
      recurrence: { kind: "single" },
      scope: "this",
    });

    expect(result.id).toBe(id);
    expect(putEvent).toHaveBeenCalledTimes(1);
    expect(putEvent.mock.calls[0][0]).toMatchObject({
      id,
      isDemo: false,
      event: { id, content: { title: "x" } },
    });
  });

  it("preserves the input calendar when replacing a missing event that carries one", async () => {
    getAllEvents.mockResolvedValue([]);

    const id = "d".repeat(24) as EventId;
    const calendarId = "e".repeat(24) as EventId;
    const result = await repository.replace(id, {
      content: { kind: "details", title: "y", description: "", location: "" },
      calendarId: calendarId as unknown as CalendarId,
      schedule: {
        kind: "timed",
        start: DateTimeSchema.parse("2026-05-05T09:00:00.000-05:00"),
        end: DateTimeSchema.parse("2026-05-05T10:00:00.000-05:00"),
        timeZone: TimeZoneSchema.parse("America/Chicago"),
      },
      recurrence: { kind: "single" },
      scope: "this",
    });

    expect(result.calendarId).toBe(calendarId as unknown as CalendarId);
  });

  const rangeQuery = {
    kind: "range" as const,
    start: "2026-05-03T00:00:00.000Z" as never,
    end: "2026-05-10T00:00:00.000Z" as never,
  };

  const seriesRecord = (isDemo = false) =>
    createMockLocalEventRecord(
      {
        schedule: {
          kind: "timed",
          start: DateTimeSchema.parse("2026-05-04T09:00:00.000Z"),
          end: DateTimeSchema.parse("2026-05-04T10:00:00.000Z"),
          timeZone: TimeZoneSchema.parse("UTC"),
        },
        recurrence: {
          kind: "series",
          rules: ["RRULE:FREQ=DAILY;COUNT=10"] as never,
        },
      },
      isDemo,
    );

  it("expands a stored series into range-bound occurrences at read time", async () => {
    const record = seriesRecord(true);
    getAllEvents.mockResolvedValue([record]);

    const events = await repository.list(rangeQuery as never);

    const instances = events.filter(
      (event) => event.recurrence.kind === "occurrence",
    );
    // Daily from May 4 bounded by the range end (May 10): 6 occurrences.
    expect(instances).toHaveLength(6);
    expect(new Date(instances[0]!.schedule.start).toISOString()).toBe(
      "2026-05-04T09:00:00.000Z",
    );
    // The id embeds the SAME instant as schedule.start, but via the shared
    // core codec's canonical (server-matching) recurrenceId format — not
    // necessarily the same string as schedule.start's own display format
    // (that stays whatever getCompassEventDateFormat produces, e.g. an
    // offset like +00:00; the codec always normalizes to .toISOString()).
    const decoded = decodeOccurrenceId(String(instances[0]!.id));
    expect(decoded?.eventId).toBe(String(record.id));
    expect(decoded && new Date(decoded.recurrenceId).toISOString()).toBe(
      new Date(instances[0]!.schedule.start).toISOString(),
    );
    // The base rides along for series metadata (the grid never renders it).
    expect(events.some((event) => event.id === record.id)).toBe(true);
  });

  it("skips excluded dates and defers to stored occurrence overrides", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);
    const base = await repository.list(rangeQuery as never);
    const [first, second] = base.filter(
      (event) => event.recurrence.kind === "occurrence",
    );

    const override = {
      version: 2 as const,
      id: second!.id,
      event: {
        ...second!,
        content: {
          kind: "details" as const,
          title: "Edited occurrence",
          description: "",
        },
      },
      isDemo: false,
    };
    getAllEvents.mockResolvedValue([
      { ...record, exdates: [first!.schedule.start as string] },
      override,
    ]);

    const events = await repository.list(rangeQuery as never);

    expect(events.some((event) => event.id === first!.id)).toBe(false);
    const kept = events.find((event) => event.id === second!.id);
    expect(kept?.content).toMatchObject({ title: "Edited occurrence" });
    expect(events.filter((event) => event.id === second!.id)).toHaveLength(1);
  });

  it("delete scope this excludes the occurrence and drops its override", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);
    const occurrenceStart = "2026-05-06T09:00:00Z";
    const id = `${record.id}::${occurrenceStart}` as EventId;

    await repository.delete(id, "this");

    expect(deleteEvent).toHaveBeenCalledWith(id);
    // Stored in schedule.start format (RFC3339 offset), not the id-suffix ISO.
    expect(putEvent.mock.calls[0][0]).toMatchObject({
      id: record.id,
      exdates: ["2026-05-06T09:00:00+00:00"],
    });
  });

  it("delete scope this round-trips: occurrence stays gone after list refetch", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);

    const before = await repository.list(rangeQuery as never);
    const target = before.find(
      (event) =>
        event.recurrence.kind === "occurrence" &&
        event.schedule.start.startsWith("2026-05-06"),
    );
    expect(target).toBeDefined();

    await repository.delete(target!.id, "this");
    getAllEvents.mockResolvedValue([putEvent.mock.calls[0][0]]);

    const after = await repository.list(rangeQuery as never);
    expect(after.some((event) => event.id === target!.id)).toBe(false);
  });

  it("delete scope this round-trips for all-day series", async () => {
    const record = createMockLocalEventRecord({
      schedule: {
        kind: "allDay",
        start: "2026-07-06" as never,
        end: "2026-07-07" as never,
      },
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=DAILY;COUNT=5"] as never,
      },
    });
    getAllEvents.mockResolvedValue([record]);
    const allDayRange = {
      kind: "range" as const,
      start: "2026-07-05T00:00:00.000Z" as never,
      end: "2026-07-12T00:00:00.000Z" as never,
    };

    const before = await repository.list(allDayRange as never);
    const target = before.find(
      (event) =>
        event.recurrence.kind === "occurrence" &&
        event.schedule.start === "2026-07-08",
    );
    expect(target).toBeDefined();

    await repository.delete(target!.id, "this");
    expect(putEvent.mock.calls[0][0].exdates).toEqual(["2026-07-08"]);
    getAllEvents.mockResolvedValue([putEvent.mock.calls[0][0]]);

    const after = await repository.list(allDayRange as never);
    expect(after.some((event) => event.id === target!.id)).toBe(false);
  });

  it("delete scope thisAndFollowing truncates the series rules", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);
    const id = `${record.id}::2026-05-06T09:00:00Z` as EventId;

    await repository.delete(id, "thisAndFollowing");

    expect(deleteEvent).not.toHaveBeenCalled();
    const saved = putEvent.mock.calls[0][0];
    expect(saved.event.recurrence.rules).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20260506T085959Z",
    ]);
  });

  it("truncates an all-day series with a full timed UTC UNTIL, never a bare date", async () => {
    // Regression guard: CompassEventRRule anchors dtstart in the guessed
    // local timezone (parseCompassEventDate + `.local()`), so a bare
    // YYYY-MM-DD UNTIL is compared against that anchored instant rather
    // than a plain calendar date. In any timezone behind UTC (all of the
    // Americas — verified directly against CompassEventRRule outside this
    // process-wide-UTC-pinned test harness under America/Denver and
    // Asia/Tokyo) a bare-date UNTIL silently drops the last kept
    // occurrence of a "this and following" split/delete on an all-day
    // series. The fix always emits the full `YYYYMMDDTHHmmssZ` format
    // truncateRules produces for timed schedules too.
    const record = createMockLocalEventRecord({
      schedule: {
        kind: "allDay",
        start: "2026-08-01" as never,
        end: "2026-08-02" as never,
      },
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=DAILY;COUNT=10"] as never,
      },
    });
    getAllEvents.mockResolvedValue([record]);
    const id = `${record.id}::2026-08-04` as EventId;

    await repository.delete(id, "thisAndFollowing");

    const saved = putEvent.mock.calls[0][0];
    expect(saved.event.recurrence.rules).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20260803T235959Z",
    ]);
  });

  it("delete scope thisAndFollowing on the first occurrence removes the series", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);
    const id = `${record.id}::2026-05-04T09:00:00.000Z` as EventId;

    await repository.delete(id, "thisAndFollowing");

    expect(deleteEvent).toHaveBeenCalledWith(record.id);
    expect(putEvent).not.toHaveBeenCalled();
  });

  it("delete scope all through an occurrence removes the series record", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);

    await repository.delete(
      `${record.id}::2026-05-06T09:00:00Z` as EventId,
      "all",
    );

    expect(deleteEvent).toHaveBeenCalledWith(record.id);
  });

  it("replace scope all through an occurrence rewrites the series record", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);
    // Content-only edit of a middle occurrence: schedule matches that
    // occurrence's original slot so the series DTSTART delta is zero.
    const occurrenceSchedule = {
      kind: "timed" as const,
      start: DateTimeSchema.parse("2026-05-06T09:00:00.000Z"),
      end: DateTimeSchema.parse("2026-05-06T10:00:00.000Z"),
      timeZone: TimeZoneSchema.parse("UTC"),
    };

    const result = await repository.replace(
      `${record.id}::2026-05-06T09:00:00.000Z` as EventId,
      {
        content: {
          kind: "details",
          title: "Renamed series",
          description: "",
          location: "",
        },
        schedule: occurrenceSchedule,
        recurrence: {
          kind: "series",
          rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] as never,
        },
        scope: "all",
      },
    );

    expect(result.id).toBe(record.id);
    expect(putEvent.mock.calls[0][0]).toMatchObject({
      id: record.id,
      event: {
        content: { title: "Renamed series" },
        schedule: record.event.schedule,
        recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] },
      },
    });
  });

  it("replace scope all shifts the series by the occurrence delta and drops overrides", async () => {
    const record = seriesRecord();
    const occurrenceStart = "2026-05-06T09:00:00.000Z";
    const occurrenceId = `${record.id}::${occurrenceStart}` as EventId;
    const override = {
      version: 2 as const,
      id: occurrenceId,
      event: {
        ...record.event,
        id: occurrenceId,
        schedule: {
          kind: "timed" as const,
          start: DateTimeSchema.parse("2026-05-07T09:00:00.000Z"),
          end: DateTimeSchema.parse("2026-05-07T10:00:00.000Z"),
          timeZone: TimeZoneSchema.parse("UTC"),
        },
        recurrence: {
          kind: "occurrence" as const,
          seriesId: record.id,
        },
      },
      isDemo: false,
    };
    getAllEvents.mockResolvedValue([record, override]);

    await repository.replace(occurrenceId, {
      content: {
        kind: "details",
        title: "Moved series",
        description: "",
        location: "",
      },
      schedule: override.event.schedule,
      recurrence: { kind: "preserve" },
      scope: "all",
    });

    expect(deleteEvent).toHaveBeenCalledWith(occurrenceId);
    expect(putEvent.mock.calls[0][0]).toMatchObject({
      id: record.id,
      event: {
        content: { title: "Moved series" },
        schedule: {
          kind: "timed",
          start: "2026-05-05T09:00:00+00:00",
          end: "2026-05-05T10:00:00+00:00",
        },
      },
    });
  });

  it("replace scope this preserve on an expanded occurrence keeps occurrence linkage", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);
    const occurrenceStart = "2026-05-06T09:00:00.000Z";
    const occurrenceId = `${record.id}::${occurrenceStart}` as EventId;
    const moved = {
      kind: "timed" as const,
      start: DateTimeSchema.parse("2026-05-07T09:00:00.000Z"),
      end: DateTimeSchema.parse("2026-05-07T10:00:00.000Z"),
      timeZone: TimeZoneSchema.parse("UTC"),
    };

    const result = await repository.replace(occurrenceId, {
      content: {
        kind: "details",
        title: "Nudged",
        description: "",
        location: "",
      },
      schedule: moved,
      recurrence: { kind: "preserve" },
      scope: "this",
    });

    expect(result.recurrence).toEqual({
      kind: "occurrence",
      seriesId: record.id,
    });
    expect(putEvent.mock.calls[0][0].event.recurrence).toEqual({
      kind: "occurrence",
      seriesId: record.id,
    });
  });

  it("undo restore after occurrence nudge keeps occurrence linkage and original schedule", async () => {
    const record = seriesRecord();
    const occurrenceStart = "2026-05-06T09:00:00.000Z";
    const occurrenceId = `${record.id}::${occurrenceStart}` as EventId;
    const originalSchedule = {
      kind: "timed" as const,
      start: DateTimeSchema.parse("2026-05-06T09:00:00.000Z"),
      end: DateTimeSchema.parse("2026-05-06T10:00:00.000Z"),
      timeZone: TimeZoneSchema.parse("UTC"),
    };
    const movedSchedule = {
      kind: "timed" as const,
      start: DateTimeSchema.parse("2026-05-07T09:00:00.000Z"),
      end: DateTimeSchema.parse("2026-05-07T10:00:00.000Z"),
      timeZone: TimeZoneSchema.parse("UTC"),
    };

    let stored: LocalEventRecord[] = [record];
    getAllEvents.mockImplementation(async () => stored);
    putEvent.mockImplementation(async (next: LocalEventRecord) => {
      stored = [
        ...stored.filter((candidate) => candidate.id !== next.id),
        next,
      ];
    });

    await repository.replace(occurrenceId, {
      content: {
        kind: "details",
        title: "Nudged",
        description: "",
        location: "",
      },
      schedule: movedSchedule,
      recurrence: { kind: "preserve" },
      scope: "this",
    });
    expect(
      stored.find((entry) => entry.id === occurrenceId)?.event.recurrence,
    ).toEqual({
      kind: "occurrence",
      seriesId: record.id,
    });

    const restored = await repository.replace(occurrenceId, {
      content: {
        kind: "details",
        title: "Nudged",
        description: "",
        location: "",
      },
      schedule: originalSchedule,
      recurrence: { kind: "preserve" },
      scope: "this",
      restore: true,
    });

    expect(restored.recurrence).toEqual({
      kind: "occurrence",
      seriesId: record.id,
    });
    expect(restored.schedule).toMatchObject({
      start: "2026-05-06T09:00:00.000Z",
      end: "2026-05-06T10:00:00.000Z",
    });
  });

  it("replace scope all on an all-day middle occurrence applies a day delta", async () => {
    const record = createMockLocalEventRecord({
      schedule: {
        kind: "allDay",
        start: DateOnlySchema.parse("2026-05-04"),
        end: DateOnlySchema.parse("2026-05-05"),
      },
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=DAILY;COUNT=10"] as never,
      },
    });
    const occurrenceStart = "2026-05-06T00:00:00.000Z";
    const occurrenceId = `${record.id}::${occurrenceStart}` as EventId;
    getAllEvents.mockResolvedValue([record]);

    await repository.replace(occurrenceId, {
      content: {
        kind: "details",
        title: "All-day moved",
        description: "",
        location: "",
      },
      schedule: {
        kind: "allDay",
        start: DateOnlySchema.parse("2026-05-07"),
        end: DateOnlySchema.parse("2026-05-08"),
      },
      recurrence: { kind: "preserve" },
      scope: "all",
    });

    expect(putEvent.mock.calls[0][0]).toMatchObject({
      id: record.id,
      event: {
        schedule: {
          kind: "allDay",
          start: "2026-05-05",
          end: "2026-05-06",
        },
      },
    });
  });

  it("nudge then promote all leaves siblings at original-plus-delta after list", async () => {
    const record = createMockLocalEventRecord({
      schedule: {
        kind: "allDay",
        start: DateOnlySchema.parse("2026-05-04"),
        end: DateOnlySchema.parse("2026-05-05"),
      },
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=DAILY;COUNT=5"] as never,
      },
    });
    // Stable in-memory store so list() after promote sees the writes.
    let stored: LocalEventRecord[] = [record];
    getAllEvents.mockImplementation(async () => stored);
    putEvent.mockImplementation(async (next: LocalEventRecord) => {
      stored = [
        ...stored.filter((candidate) => candidate.id !== next.id),
        next,
      ];
    });
    deleteEvent.mockImplementation(async (id: EventId) => {
      stored = stored.filter((candidate) => candidate.id !== id);
    });

    const before = await repository.list(rangeQuery as never);
    const target = before.find(
      (event) =>
        event.recurrence.kind === "occurrence" &&
        event.schedule.kind === "allDay" &&
        event.schedule.start === "2026-05-06",
    );
    expect(target).toBeDefined();

    await repository.replace(target!.id, {
      content: {
        kind: "details",
        title: "Nudged day",
        description: "",
        location: "",
      },
      schedule: {
        kind: "allDay",
        start: DateOnlySchema.parse("2026-05-07"),
        end: DateOnlySchema.parse("2026-05-08"),
      },
      recurrence: { kind: "preserve" },
      scope: "this",
    });

    await repository.replace(target!.id, {
      content: {
        kind: "details",
        title: "Nudged day",
        description: "",
        location: "",
      },
      schedule: {
        kind: "allDay",
        start: DateOnlySchema.parse("2026-05-07"),
        end: DateOnlySchema.parse("2026-05-08"),
      },
      recurrence: { kind: "preserve" },
      scope: "all",
    });

    const after = await repository.list(rangeQuery as never);
    const instanceStarts = after
      .filter((event) => event.recurrence.kind === "occurrence")
      .map((event) =>
        event.schedule.kind === "allDay" ? event.schedule.start : null,
      )
      .filter(Boolean)
      .sort();

    expect(instanceStarts).toEqual([
      DateOnlySchema.parse("2026-05-05"),
      DateOnlySchema.parse("2026-05-06"),
      DateOnlySchema.parse("2026-05-07"),
      DateOnlySchema.parse("2026-05-08"),
      DateOnlySchema.parse("2026-05-09"),
    ]);
    expect(stored.some((entry) => entry.id.includes("::"))).toBe(false);
  });

  it("replace scope thisAndFollowing splits the series", async () => {
    const record = seriesRecord();
    getAllEvents.mockResolvedValue([record]);
    const occurrenceStart = "2026-05-06T09:00:00Z";
    const id = `${record.id}::${occurrenceStart}` as EventId;

    const result = await repository.replace(id, {
      content: {
        kind: "details",
        title: "New leg",
        description: "",
        location: "",
      },
      schedule: {
        kind: "timed",
        start: DateTimeSchema.parse("2026-05-06T11:00:00.000Z"),
        end: DateTimeSchema.parse("2026-05-06T12:00:00.000Z"),
        timeZone: TimeZoneSchema.parse("UTC"),
      },
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=DAILY;COUNT=4"] as never,
      },
      scope: "thisAndFollowing",
    });

    expect(putEvent.mock.calls[0][0]).toMatchObject({
      id: record.id,
      event: {
        recurrence: {
          kind: "series",
          rules: ["RRULE:FREQ=DAILY;UNTIL=20260506T085959Z"],
        },
      },
    });
    expect(result.id).toBe(id);
    expect(putEvent.mock.calls[1][0]).toMatchObject({
      id,
      event: {
        id,
        content: { title: "New leg" },
        recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=4"] },
      },
    });
  });

  it("series-wide replace does not delete a thisAndFollowing remainder series", async () => {
    const head = seriesRecord();
    const remainderId = `${head.id}::2026-05-06T09:00:00.000Z` as EventId;
    const remainder: LocalEventRecord = {
      version: 2,
      id: remainderId,
      isDemo: false,
      event: {
        ...head.event,
        id: remainderId,
        schedule: {
          kind: "timed",
          start: DateTimeSchema.parse("2026-05-06T11:00:00.000Z"),
          end: DateTimeSchema.parse("2026-05-06T12:00:00.000Z"),
          timeZone: TimeZoneSchema.parse("UTC"),
        },
        recurrence: {
          kind: "series",
          rules: ["RRULE:FREQ=DAILY;COUNT=4"] as never,
        },
      },
    };
    const overrideId = `${head.id}::2026-05-05T09:00:00.000Z` as EventId;
    const override: LocalEventRecord = {
      version: 2,
      id: overrideId,
      isDemo: false,
      event: {
        ...head.event,
        id: overrideId,
        content: {
          kind: "details",
          title: "Override",
          description: "",
        },
        recurrence: { kind: "occurrence", seriesId: head.id },
      },
    };

    let stored: LocalEventRecord[] = [head, remainder, override];
    getAllEvents.mockImplementation(async () => stored);
    putEvent.mockImplementation(async (next: LocalEventRecord) => {
      stored = [
        ...stored.filter((candidate) => candidate.id !== next.id),
        next,
      ];
    });
    deleteEvent.mockImplementation(async (id: EventId) => {
      stored = stored.filter((candidate) => candidate.id !== id);
    });

    await repository.replace(
      `${head.id}::2026-05-04T09:00:00.000Z` as EventId,
      {
        content: {
          kind: "details",
          title: "Head renamed",
          description: "",
          location: "",
        },
        schedule: head.event.schedule,
        recurrence: { kind: "preserve" },
        scope: "all",
      },
    );

    expect(stored.some((entry) => entry.id === remainderId)).toBe(true);
    expect(stored.some((entry) => entry.id === overrideId)).toBe(false);
    expect(
      stored.find((entry) => entry.id === head.id)?.event.content,
    ).toMatchObject({ title: "Head renamed" });
  });
});

describe("LocalEventRepository default store", () => {
  afterEach(() => {
    resetOfflineDataStoreForTests();
  });

  it("waits for offline store init before listing", async () => {
    let finish: (() => void) | undefined;
    const initialize = mock(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const getAllEvents = mock(async () => [] as LocalEventRecord[]);
    resetOfflineDataStoreForTests({
      initialize,
      isReady: () => false,
      getEvents: async () => [],
      getAllEvents,
      putEvent: async () => undefined,
      putEvents: async () => undefined,
      deleteEvent: async () => undefined,
      clearAllEvents: async () => undefined,
      getAllTasks: async () => [],
      getTaskCount: async () => 0,
      clearAllTasks: async () => undefined,
      getMigrationRecords: async () => [],
      setMigrationRecord: async () => undefined,
    });

    const pending = new LocalEventRepository().list({
      kind: "range",
      start: "2026-05-03T00:00:00.000Z",
      end: "2026-05-10T00:00:00.000Z",
    } as never);

    await Promise.resolve();
    expect(getAllEvents).not.toHaveBeenCalled();

    finish?.();
    await pending;
    expect(getAllEvents).toHaveBeenCalled();
  });
});
