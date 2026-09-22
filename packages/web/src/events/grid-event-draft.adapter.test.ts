import { act } from "react";
import { Origin } from "@core/constants/core.constants";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  resetEffectiveTimeZoneStoreForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import {
  allDayGridSchedule,
  createGridEventDraft,
  duplicateGridEventDraft,
  editGridEventDraft,
  gridEventDraftToGridEvent,
  parseGridEventDraft,
  replaceGridDraftSchedule,
  resolveDraftRecurrenceRules,
  suppressedSeriesIdForDraft,
} from "./grid-event-draft.adapter";
import { patchGridDraftRecurrence } from "./recurrence/recurrence-rules-equal";
import { expect, test } from "bun:test";

const timedEvent = {
  id: "0123456789abcdef01234567",
  calendarId: "0123456789abcdef76543210",
  content: { kind: "details" as const, title: "Focus", description: "" },
  schedule: {
    kind: "timed" as const,
    start: "2026-07-11T09:00:00-06:00",
    end: "2026-07-11T10:00:00-06:00",
    timeZone: "America/Denver",
  },
  recurrence: { kind: "single" as const },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: null,
} as unknown as Event;

const SERIES_ID = "0123456789abcdefaaaaaaaa";
const SERIES_RULES = ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE"];

const occurrenceEvent = {
  ...(timedEvent as object),
  id: "0123456789abcdef01234599",
  recurrence: { kind: "occurrence" as const, seriesId: SERIES_ID },
} as unknown as Event;

test("creates an incomplete grid draft without manufacturing an Event", () => {
  const draft = createGridEventDraft({
    kind: "allDay",
    start: new Date("2026-07-11"),
    end: new Date("2026-07-12"),
  });

  expect(draft).toMatchObject({
    kind: "create",
    source: null,
    values: { calendarId: null, recurrence: { kind: "single" } },
  });
});

test("builds an edit draft from a persisted scheduled event", () => {
  const draft = editGridEventDraft(timedEvent);

  expect(draft).toMatchObject({
    kind: "edit",
    source: timedEvent,
    values: { title: "Focus", recurrence: { kind: "preserve" } },
  });
});

test("replaces only the draft schedule", () => {
  const draft = createGridEventDraft({
    kind: "allDay",
    start: new Date("2026-07-11"),
    end: new Date("2026-07-12"),
  });
  const updated = replaceGridDraftSchedule(draft, {
    kind: "allDay",
    start: new Date("2026-07-12"),
    end: new Date("2026-07-13"),
  });

  expect(updated.values.schedule.start).toEqual(new Date("2026-07-12"));
  expect(updated.values.calendarId).toBeNull();
});

test("keeps the schedule's own UTC offset instead of forcing Z", () => {
  // Grid position and time label both localize CompassEvent.startDate/
  // endDate to the browser's timezone on read, so the stored offset itself
  // doesn't affect what's displayed - but Date#toISOString() always produces
  // a "Z" (UTC) suffix, which is a needless loss of the source offset and
  // out of step with every other CompassEvent producer. dayjs's default
  // format() preserves the local offset instead, matching every other
  // CompassEvent producer (draft.util.ts, etc).
  const draft = editGridEventDraft(timedEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  const gridEvent = gridEventDraftToGridEvent(draft);

  expect(gridEvent.startDate).not.toMatch(/Z$/);
  expect(gridEvent.endDate).not.toMatch(/Z$/);
});

test("attaches a create draft clientId as CreateEventInput.id", () => {
  const clientId = "0123456789abcdef01234567";
  const draft = createGridEventDraft(
    {
      kind: "timed",
      start: new Date("2026-07-11T09:00:00-06:00"),
      end: new Date("2026-07-11T10:00:00-06:00"),
      timeZone: "America/Denver",
    },
    EventIdSchema.parse(clientId),
    timedEvent.calendarId,
  );

  const result = parseGridEventDraft(draft);

  expect(result).toMatchObject({
    ok: true,
    mode: "create",
    input: { id: clientId },
  });
});

test("parses an edit draft into a replace command", () => {
  const draft = editGridEventDraft(timedEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  const result = parseGridEventDraft(draft);

  expect(result).toMatchObject({
    ok: true,
    mode: "edit",
    eventId: timedEvent.id,
    input: {
      scope: "this",
      schedule: { kind: "timed" },
      recurrence: { kind: "preserve" },
    },
  });
});

test("duplicate defaults to the source event's calendar when it's still writable", () => {
  const writableSourceCalendar = {
    id: timedEvent.calendarId,
    capabilities: getCalendarCapabilities("owner"),
  } as unknown as Calendar;

  const duplicate = duplicateGridEventDraft(timedEvent, [
    writableSourceCalendar,
  ]);

  expect(duplicate).toMatchObject({
    kind: "create",
    source: null,
    values: { calendarId: timedEvent.calendarId, title: "Focus" },
  });
});

test("projects a grid draft into a grid event without a CompassEvent bridge", () => {
  const allDay = createGridEventDraft({
    kind: "allDay",
    start: new Date("2026-05-20"),
    end: new Date("2026-05-21"),
  });
  allDay.values.title = "All day";
  allDay.values.calendarId = timedEvent.calendarId;
  const allDayGrid = gridEventDraftToGridEvent(allDay);

  expect(allDayGrid.startDate).toBe("2026-05-20");
  expect(allDayGrid.endDate).toBe("2026-05-21");
  expect(allDayGrid.isAllDay).toBe(true);
  expect(allDayGrid.title).toBe("All day");
  expect(allDayGrid.calendarId).toBe(timedEvent.calendarId);
  expect(allDayGrid.origin).toBe(Origin.COMPASS);

  const timed = editGridEventDraft(timedEvent);
  if (!timed) throw new Error("Expected timed edit draft");
  timed.values.color = "coral";
  const timedGrid = gridEventDraftToGridEvent(timed);

  expect(timedGrid.isAllDay).toBe(false);
  expect(timedGrid.startDate).toBe(dayjs(timed.values.schedule.start).format());
  expect(timedGrid.endDate).toBe(dayjs(timed.values.schedule.end).format());
  expect(timedGrid.color).toBe("coral");
  expect(timedGrid.isBusy).toBe(false);
});

test("duplicate falls back to no calendar (later defaulted) when the source calendar is read-only", () => {
  const readOnlySourceCalendar = {
    id: timedEvent.calendarId,
    capabilities: getCalendarCapabilities("reader"),
  } as unknown as Calendar;

  const duplicate = duplicateGridEventDraft(timedEvent, [
    readOnlySourceCalendar,
  ]);

  expect(duplicate?.values.calendarId).toBeNull();
});

test("duplicate preserves series rules and drops occurrence links", () => {
  const writableSourceCalendar = {
    id: timedEvent.calendarId,
    capabilities: getCalendarCapabilities("owner"),
  } as unknown as Calendar;

  const seriesEvent = {
    ...(timedEvent as object),
    recurrence: { kind: "series" as const, rules: SERIES_RULES },
  } as unknown as Event;

  const seriesDuplicate = duplicateGridEventDraft(seriesEvent, [
    writableSourceCalendar,
  ]);
  expect(seriesDuplicate?.values.recurrence).toEqual({
    kind: "series",
    rules: SERIES_RULES,
  });

  const occurrenceDuplicate = duplicateGridEventDraft(occurrenceEvent, [
    writableSourceCalendar,
  ]);
  expect(occurrenceDuplicate?.values.recurrence).toEqual({ kind: "single" });
});

test("duplicate falls back to no calendar when the source calendar isn't in the given list", () => {
  const duplicate = duplicateGridEventDraft(timedEvent, []);

  expect(duplicate?.values.calendarId).toBeNull();
});

test("duplicating an all-day event round-trips the same calendar day through the full draft-to-save pipeline", () => {
  // Guards the fix for a bug that landed all-day duplicates a day early in
  // any timezone west of UTC: gridScheduleFromEvent parsed the date-only
  // string as UTC midnight while toDateOnlyString re-serialized it in local
  // time. Both now go through dayjs's local-parse/local-format, so this
  // round trip holds regardless of timezone.
  //
  // bun test always runs with the ambient timezone pinned to UTC, where UTC
  // parsing and local parsing produce the same instant - so this test can't
  // reproduce the actual day-shift (verified manually instead, in a real
  // America/Denver browser session: duplicate lands on the same day and
  // survives a reload). It still guards the round trip itself, which would
  // fail under any ambient timezone if the two conventions drifted apart
  // again.
  const allDayEvent = {
    ...(timedEvent as object),
    id: "0123456789abcdef01234568",
    content: {
      kind: "details" as const,
      title: "Deep work day",
      description: "",
    },
    schedule: {
      kind: "allDay" as const,
      start: "2026-07-20",
      end: "2026-07-21",
    },
  } as unknown as Event;

  const writableSourceCalendar = {
    id: allDayEvent.calendarId,
    capabilities: getCalendarCapabilities("owner"),
  } as unknown as Calendar;

  const duplicate = duplicateGridEventDraft(allDayEvent, [
    writableSourceCalendar,
  ]);
  if (!duplicate) throw new Error("Expected duplicate draft");

  const result = parseGridEventDraft(duplicate);

  expect(result).toMatchObject({
    ok: true,
    mode: "create",
    input: {
      schedule: { kind: "allDay", start: "2026-07-20", end: "2026-07-21" },
    },
  });

  // The grid projection the draft renders from must agree with what gets
  // saved.
  expect(gridEventDraftToGridEvent(duplicate)).toMatchObject({
    startDate: "2026-07-20",
    endDate: "2026-07-21",
  });
});

test("an occurrence projects with no rule when the series base isn't resolved", () => {
  const draft = editGridEventDraft(occurrenceEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  expect(gridEventDraftToGridEvent(draft).recurrence).toEqual({
    eventId: SERIES_ID,
  });
});

test("an occurrence resolves series rules when seriesRules is provided", () => {
  const draft = editGridEventDraft(occurrenceEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  expect(resolveDraftRecurrenceRules(draft, SERIES_RULES)).toEqual(
    SERIES_RULES,
  );
});

test("a patch that echoes the hydrated rule unchanged keeps the draft's recurrence as preserve", () => {
  const draft = editGridEventDraft(occurrenceEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  const updated = patchGridDraftRecurrence(
    {
      ...draft,
      values: { ...draft.values, title: "Retitled mid-edit" },
    } as GridEventDraft,
    resolveDraftRecurrenceRules(draft, SERIES_RULES),
    SERIES_RULES,
  );

  expect(updated.values).toMatchObject({
    title: "Retitled mid-edit",
    recurrence: { kind: "preserve" },
  });
});

test("a patch with semantically equal INTERVAL=1 drift keeps preserve", () => {
  const draft = editGridEventDraft(occurrenceEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  // SERIES_RULES omit INTERVAL; the form rebuild re-emits INTERVAL=1.
  const updated = patchGridDraftRecurrence(
    draft,
    ["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE"],
    SERIES_RULES,
  );

  expect(updated.values.recurrence).toEqual({ kind: "preserve" });
});

test("a patch with a genuinely different rule converts the draft to an explicit series edit", () => {
  const draft = editGridEventDraft(occurrenceEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  const updated = patchGridDraftRecurrence(
    draft,
    ["RRULE:FREQ=DAILY"],
    SERIES_RULES,
  );

  expect(updated.values.recurrence).toEqual({
    kind: "series",
    rules: ["RRULE:FREQ=DAILY"],
  });
});

test("clearing recurrence on an edit draft produces an explicit single, not preserve", () => {
  // preserve would resolve back through the source event's own rules
  // (legacyRecurrenceFromDraft), making the Repeat toggle a no-op for an
  // existing recurring event - the exact bug this guards against.
  const draft = editGridEventDraft(occurrenceEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  const updated = patchGridDraftRecurrence(draft, [], SERIES_RULES);

  expect(updated.values.recurrence).toEqual({ kind: "single" });
});

test("suppressedSeriesIdForDraft: null for a null draft", () => {
  expect(suppressedSeriesIdForDraft(null)).toBeNull();
});

test("suppressedSeriesIdForDraft: null for a create draft", () => {
  const draft = createGridEventDraft({
    kind: "allDay",
    start: new Date("2026-07-11"),
    end: new Date("2026-07-12"),
  });

  expect(suppressedSeriesIdForDraft(draft)).toBeNull();
});

test("suppressedSeriesIdForDraft: null for an untouched edit draft (preserve)", () => {
  const draft = editGridEventDraft(occurrenceEvent);

  expect(suppressedSeriesIdForDraft(draft)).toBeNull();
});

test("suppressedSeriesIdForDraft: the series id once an occurrence's recurrence is explicitly edited", () => {
  const draft = editGridEventDraft(occurrenceEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  const edited = patchGridDraftRecurrence(
    draft,
    ["RRULE:FREQ=DAILY"],
    SERIES_RULES,
  );

  expect(suppressedSeriesIdForDraft(edited)).toEqual(SERIES_ID);
});

test("suppressedSeriesIdForDraft: the series id once an occurrence's recurrence is cleared entirely", () => {
  const draft = editGridEventDraft(occurrenceEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  const cleared = patchGridDraftRecurrence(draft, [], SERIES_RULES);

  expect(suppressedSeriesIdForDraft(cleared)).toEqual(SERIES_ID);
});

test("suppressedSeriesIdForDraft: the base event's own id once a series base's recurrence is edited", () => {
  const seriesEvent = {
    ...(timedEvent as object),
    recurrence: { kind: "series" as const, rules: SERIES_RULES },
  } as unknown as Event;
  const draft = editGridEventDraft(seriesEvent);
  if (!draft) throw new Error("Expected scheduled event draft");

  const edited = patchGridDraftRecurrence(draft, ["RRULE:FREQ=DAILY"]);

  expect(suppressedSeriesIdForDraft(edited)).toEqual(seriesEvent.id);
});

test("all-day YMD stays on the pinned calendar day when it is west of the runtime", () => {
  act(() => {
    setPinnedTimeZone("America/Chicago");
  });
  try {
    const draft = createGridEventDraft(
      allDayGridSchedule("2026-05-17", "2026-05-18"),
    );

    expect(gridEventDraftToGridEvent(draft).startDate).toBe("2026-05-17");
    expect(gridEventDraftToGridEvent(draft).endDate).toBe("2026-05-18");
  } finally {
    act(() => {
      resetEffectiveTimeZoneStoreForTests();
    });
  }
});
