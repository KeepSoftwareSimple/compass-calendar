import { act } from "react";
import { Origin } from "@core/constants/core.constants";
import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import {
  allDayGridSchedule,
  createGridEventDraft,
} from "@web/events/grid-event-draft.adapter";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import {
  resetEffectiveTimeZoneStoreForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { calendarDateInEffectiveTimeZone } from "@web/timezone/in-time-zone";
import { addVisibleDraftEvent } from "./dayCalendarDraft.util";
import { afterEach, describe, expect, it } from "bun:test";

const visibleDates: GridVisibleDate[] = [
  { key: "2026-05-22", date: dayjs("2026-05-22T00:00:00") },
];

const savedTimed = {
  _id: "saved-timed",
  title: "Saved",
  isAllDay: false,
  startDate: "2026-05-22T10:00:00",
  endDate: "2026-05-22T11:00:00",
  origin: Origin.COMPASS,
  user: "user",
  position: gridEventDefaultPosition,
} as GridEvent;

describe("addVisibleDraftEvent", () => {
  afterEach(() => {
    act(() => {
      resetEffectiveTimeZoneStoreForTests();
    });
  });

  it("does not inject a multi-day timed draft into the timed layer", () => {
    const draft = createGridEventDraft({
      kind: "timed",
      start: new Date("2026-05-22T08:00:00"),
      end: new Date("2026-05-23T18:00:00"),
      timeZone: "UTC",
    });

    const result = addVisibleDraftEvent({
      draft,
      events: [savedTimed],
      isAllDay: false,
      visibleDates,
    });

    expect(result).toEqual([savedTimed]);
  });

  it("still injects a same-day timed draft into the timed layer", () => {
    const draft = createGridEventDraft({
      kind: "timed",
      start: new Date("2026-05-22T14:00:00"),
      end: new Date("2026-05-22T15:00:00"),
      timeZone: "UTC",
    });

    const result = addVisibleDraftEvent({
      draft,
      events: [savedTimed],
      isAllDay: false,
      visibleDates,
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.startDate).toContain("2026-05-22T14:00:00");
  });

  it("does not inject a midnight-to-midnight timed draft into the timed layer", () => {
    const draft = createGridEventDraft({
      kind: "timed",
      start: new Date("2026-05-22T00:00:00"),
      end: new Date("2026-05-23T00:00:00"),
      timeZone: "UTC",
    });

    const result = addVisibleDraftEvent({
      draft,
      events: [savedTimed],
      isAllDay: false,
      visibleDates,
    });

    expect(result).toEqual([savedTimed]);
  });

  it("still injects an evening-to-midnight timed draft into the timed layer", () => {
    const draft = createGridEventDraft({
      kind: "timed",
      start: new Date("2026-05-22T22:00:00"),
      end: new Date("2026-05-23T00:00:00"),
      timeZone: "UTC",
    });

    const result = addVisibleDraftEvent({
      draft,
      events: [savedTimed],
      isAllDay: false,
      visibleDates,
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.startDate).toContain("2026-05-22T22:00:00");
  });

  it("keeps a pinned all-day draft on its calendar day", () => {
    act(() => {
      setPinnedTimeZone("America/Chicago");
    });

    const draft = createGridEventDraft(
      allDayGridSchedule("2026-05-22", "2026-05-23"),
    );
    const chicagoDay: GridVisibleDate[] = [
      {
        key: "2026-05-22",
        date: calendarDateInEffectiveTimeZone("2026-05-22"),
      },
    ];

    const result = addVisibleDraftEvent({
      draft,
      events: [],
      isAllDay: true,
      visibleDates: chicagoDay,
    });

    expect(result).toHaveLength(1);
  });
});
