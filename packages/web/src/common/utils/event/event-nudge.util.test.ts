import dayjs from "@core/util/date/dayjs";
import {
  convertAllDayToTimedDates,
  getArrowKeyMovement,
  isTimedEventFullCalendarDay,
  isTimedEventInsideOneDay,
  isTimedEventMultiDay,
  nudgeEventDates,
  nudgeEventEdgeDates,
  shouldRenderTimedInAllDayRow,
  timedMultiDayToAllDayDates,
} from "@web/common/utils/event/event-nudge.util";
import { GRID_TIME_STEP } from "@web/grid/grid.constants";
import { describe, expect, it } from "bun:test";

describe("getArrowKeyMovement", () => {
  it("maps left/right to day moves for timed and all-day events", () => {
    expect(getArrowKeyMovement("ArrowLeft", false)).toEqual({
      days: -1,
      minutes: 0,
    });
    expect(getArrowKeyMovement("ArrowRight", true)).toEqual({
      days: 1,
      minutes: 0,
    });
  });

  it("maps up/down to 15-minute moves for timed events", () => {
    expect(getArrowKeyMovement("ArrowUp", false)).toEqual({
      days: 0,
      minutes: -GRID_TIME_STEP,
    });
    expect(getArrowKeyMovement("ArrowDown", false)).toEqual({
      days: 0,
      minutes: GRID_TIME_STEP,
    });
  });

  it("returns null for up/down on all-day events and unknown keys", () => {
    expect(getArrowKeyMovement("ArrowUp", true)).toBeNull();
    expect(getArrowKeyMovement("ArrowDown", true)).toBeNull();
    expect(getArrowKeyMovement("Enter", false)).toBeNull();
  });

  it("maps coarse arrows to 60 minutes or 7 days", () => {
    expect(getArrowKeyMovement("ArrowUp", false, "coarse")).toEqual({
      days: 0,
      minutes: -60,
    });
    expect(getArrowKeyMovement("ArrowDown", false, "coarse")).toEqual({
      days: 0,
      minutes: 60,
    });
    expect(getArrowKeyMovement("ArrowLeft", false, "coarse")).toEqual({
      days: -7,
      minutes: 0,
    });
    expect(getArrowKeyMovement("ArrowRight", true, "coarse")).toEqual({
      days: 7,
      minutes: 0,
    });
    expect(getArrowKeyMovement("ArrowUp", true, "coarse")).toBeNull();
  });
});

describe("convertAllDayToTimedDates", () => {
  it("places the event at the given start minute on its start day with a 60-minute duration", () => {
    const result = convertAllDayToTimedDates(
      { startDate: "2026-05-20" },
      9 * 60,
    );

    expect(result.startDate).toStartWith("2026-05-20T09:00:00");
    expect(result.endDate).toStartWith("2026-05-20T10:00:00");
  });

  it("only reads the event's start day, so a multi-day span collapses onto it", () => {
    const result = convertAllDayToTimedDates(
      { startDate: "2026-05-20" },
      13 * 60 + 30,
    );

    expect(result.startDate).toStartWith("2026-05-20T13:30:00");
    expect(result.endDate).toStartWith("2026-05-20T14:30:00");
  });
});

describe("nudgeEventDates", () => {
  const timedEvent = {
    startDate: "2026-05-20T10:00:00",
    endDate: "2026-05-20T11:00:00",
    isAllDay: false,
  };

  it("moves a timed event by 15 minutes", () => {
    const result = nudgeEventDates(timedEvent, { days: 0, minutes: 15 });

    expect(result).not.toBeNull();
    expect(result?.startDate).toStartWith("2026-05-20T10:15:00");
    expect(result?.endDate).toStartWith("2026-05-20T11:15:00");
  });

  it("moves a timed event by a day", () => {
    const result = nudgeEventDates(timedEvent, { days: 1, minutes: 0 });

    expect(result?.startDate).toStartWith("2026-05-21T10:00:00");
    expect(result?.endDate).toStartWith("2026-05-21T11:00:00");
  });

  it("returns null when moving up would cross into the previous day", () => {
    const result = nudgeEventDates(
      {
        startDate: "2026-05-20T00:00:00",
        endDate: "2026-05-20T01:00:00",
        isAllDay: false,
      },
      { days: 0, minutes: -15 },
    );

    expect(result).toBeNull();
  });

  it("allows moving down until the end lands exactly on midnight", () => {
    const onMidnight = nudgeEventDates(
      {
        startDate: "2026-05-20T23:00:00",
        endDate: "2026-05-20T23:45:00",
        isAllDay: false,
      },
      { days: 0, minutes: 15 },
    );
    expect(onMidnight?.endDate).toStartWith("2026-05-21T00:00:00");

    const pastMidnight = nudgeEventDates(
      {
        startDate: "2026-05-20T23:15:00",
        endDate: "2026-05-21T00:00:00",
        isAllDay: false,
      },
      { days: 0, minutes: 15 },
    );
    expect(pastMidnight).toBeNull();
  });

  it("keeps YYYY-MM-DD format for all-day day moves", () => {
    const result = nudgeEventDates(
      { startDate: "2026-05-20", endDate: "2026-05-21", isAllDay: true },
      { days: -1, minutes: 0 },
    );

    expect(result).toEqual({ startDate: "2026-05-19", endDate: "2026-05-20" });
  });

  it("returns null for minute moves on all-day events", () => {
    const result = nudgeEventDates(
      { startDate: "2026-05-20", endDate: "2026-05-21", isAllDay: true },
      { days: 0, minutes: 15 },
    );

    expect(result).toBeNull();
  });
});

describe("nudgeEventEdgeDates", () => {
  const timedEvent = {
    startDate: "2026-05-20T10:00:00",
    endDate: "2026-05-20T10:30:00",
    isAllDay: false,
  };

  it("moves the start edge later without touching the end", () => {
    const result = nudgeEventEdgeDates(timedEvent, "startDate", {
      days: 0,
      minutes: 15,
    });

    expect(result?.startDate).toStartWith("2026-05-20T10:15:00");
    expect(result?.endDate).toStartWith("2026-05-20T10:30:00");
    expect(result?.edge).toBe("startDate");
  });

  it("moves the end edge earlier without touching the start", () => {
    const result = nudgeEventEdgeDates(timedEvent, "endDate", {
      days: 0,
      minutes: -15,
    });

    expect(result?.startDate).toStartWith("2026-05-20T10:00:00");
    expect(result?.endDate).toStartWith("2026-05-20T10:15:00");
    expect(result?.edge).toBe("endDate");
  });

  it("does not flip when the move lands exactly at the 15-minute minimum", () => {
    const result = nudgeEventEdgeDates(
      {
        startDate: "2026-05-20T10:00:00",
        endDate: "2026-05-20T10:30:00",
        isAllDay: false,
      },
      "startDate",
      { days: 0, minutes: 15 },
    );

    expect(result?.startDate).toStartWith("2026-05-20T10:15:00");
    expect(result?.endDate).toStartWith("2026-05-20T10:30:00");
    expect(result?.edge).toBe("startDate");
  });

  it("flips the start edge to the end edge past the minimum duration", () => {
    const result = nudgeEventEdgeDates(
      {
        startDate: "2026-05-20T10:15:00",
        endDate: "2026-05-20T10:30:00",
        isAllDay: false,
      },
      "startDate",
      { days: 0, minutes: 15 },
    );

    expect(result?.startDate).toStartWith("2026-05-20T10:30:00");
    expect(result?.endDate).toStartWith("2026-05-20T10:45:00");
    expect(result?.edge).toBe("endDate");
  });

  it("flips the end edge to the start edge past the minimum duration", () => {
    const result = nudgeEventEdgeDates(
      {
        startDate: "2026-05-20T10:00:00",
        endDate: "2026-05-20T10:15:00",
        isAllDay: false,
      },
      "endDate",
      { days: 0, minutes: -15 },
    );

    expect(result?.startDate).toStartWith("2026-05-20T09:45:00");
    expect(result?.endDate).toStartWith("2026-05-20T10:00:00");
    expect(result?.edge).toBe("startDate");
  });

  it("rejects a start-edge move that would cross into the previous day", () => {
    const result = nudgeEventEdgeDates(
      {
        startDate: "2026-05-20T00:00:00",
        endDate: "2026-05-20T01:00:00",
        isAllDay: false,
      },
      "startDate",
      { days: 0, minutes: -15 },
    );

    expect(result).toBeNull();
  });

  it("allows the end edge to land exactly on next midnight", () => {
    const result = nudgeEventEdgeDates(
      {
        startDate: "2026-05-20T23:00:00",
        endDate: "2026-05-20T23:45:00",
        isAllDay: false,
      },
      "endDate",
      { days: 0, minutes: 15 },
    );

    expect(result?.endDate).toStartWith("2026-05-21T00:00:00");
  });

  it("rejects a flip that would cross midnight", () => {
    const result = nudgeEventEdgeDates(
      {
        startDate: "2026-05-20T23:38:00",
        endDate: "2026-05-20T23:50:00",
        isAllDay: false,
      },
      "startDate",
      { days: 0, minutes: 15 },
    );

    expect(result).toBeNull();
  });

  it("rejects day movement on a timed edge", () => {
    const result = nudgeEventEdgeDates(timedEvent, "startDate", {
      days: 1,
      minutes: 0,
    });

    expect(result).toBeNull();
  });

  it("moves an all-day start edge earlier without touching the end", () => {
    const result = nudgeEventEdgeDates(
      { startDate: "2026-05-20", endDate: "2026-05-22", isAllDay: true },
      "startDate",
      { days: -1, minutes: 0 },
    );

    expect(result).toEqual({
      startDate: "2026-05-19",
      endDate: "2026-05-22",
      edge: "startDate",
    });
  });

  it("moves an all-day end edge later without touching the start", () => {
    const result = nudgeEventEdgeDates(
      { startDate: "2026-05-20", endDate: "2026-05-22", isAllDay: true },
      "endDate",
      { days: 1, minutes: 0 },
    );

    expect(result).toEqual({
      startDate: "2026-05-20",
      endDate: "2026-05-23",
      edge: "endDate",
    });
  });

  it("flips a one-day all-day event's start edge to the end edge", () => {
    const result = nudgeEventEdgeDates(
      { startDate: "2026-05-20", endDate: "2026-05-21", isAllDay: true },
      "startDate",
      { days: 1, minutes: 0 },
    );

    expect(result).toEqual({
      startDate: "2026-05-20",
      endDate: "2026-05-22",
      edge: "endDate",
    });
  });

  it("flips a one-day all-day event's end edge to the start edge", () => {
    const result = nudgeEventEdgeDates(
      { startDate: "2026-05-20", endDate: "2026-05-21", isAllDay: true },
      "endDate",
      { days: -1, minutes: 0 },
    );

    expect(result).toEqual({
      startDate: "2026-05-19",
      endDate: "2026-05-21",
      edge: "startDate",
    });
  });

  it("rejects minute movement on an all-day edge", () => {
    const result = nudgeEventEdgeDates(
      { startDate: "2026-05-20", endDate: "2026-05-21", isAllDay: true },
      "startDate",
      { days: 0, minutes: 15 },
    );

    expect(result).toBeNull();
  });
});

describe("isTimedEventMultiDay", () => {
  it("is false for same-day timed events and exact next-midnight ends", () => {
    expect(
      isTimedEventMultiDay(
        dayjs("2026-05-20T10:00:00"),
        dayjs("2026-05-20T11:00:00"),
      ),
    ).toBe(false);
    expect(
      isTimedEventInsideOneDay(
        dayjs("2026-05-20T22:00:00"),
        dayjs("2026-05-21T00:00:00"),
      ),
    ).toBe(true);
    expect(
      isTimedEventMultiDay(
        dayjs("2026-05-20T22:00:00"),
        dayjs("2026-05-21T00:00:00"),
      ),
    ).toBe(false);
  });

  it("is true for overnight and multi-day timed ranges", () => {
    expect(
      isTimedEventMultiDay(
        dayjs("2026-05-20T22:00:00"),
        dayjs("2026-05-21T02:00:00"),
      ),
    ).toBe(true);
    expect(
      isTimedEventMultiDay(
        dayjs("2026-05-20T08:00:00"),
        dayjs("2026-05-21T18:00:00"),
      ),
    ).toBe(true);
  });
});

describe("isTimedEventFullCalendarDay", () => {
  it("is true for midnight to next midnight", () => {
    expect(
      isTimedEventFullCalendarDay(
        dayjs("2026-05-20T00:00:00"),
        dayjs("2026-05-21T00:00:00"),
      ),
    ).toBe(true);
  });

  it("is false for evening events that end at next midnight", () => {
    expect(
      isTimedEventFullCalendarDay(
        dayjs("2026-05-20T22:00:00"),
        dayjs("2026-05-21T00:00:00"),
      ),
    ).toBe(false);
  });

  it("is false for same-day timed and overnight multi-day ranges", () => {
    expect(
      isTimedEventFullCalendarDay(
        dayjs("2026-05-20T10:00:00"),
        dayjs("2026-05-20T11:00:00"),
      ),
    ).toBe(false);
    expect(
      isTimedEventFullCalendarDay(
        dayjs("2026-05-20T22:00:00"),
        dayjs("2026-05-21T02:00:00"),
      ),
    ).toBe(false);
  });
});

describe("shouldRenderTimedInAllDayRow", () => {
  it("promotes full-calendar-day timed events and multi-day timed events", () => {
    expect(
      shouldRenderTimedInAllDayRow(
        dayjs("2026-05-20T00:00:00"),
        dayjs("2026-05-21T00:00:00"),
      ),
    ).toBe(true);
    expect(
      shouldRenderTimedInAllDayRow(
        dayjs("2026-05-20T22:00:00"),
        dayjs("2026-05-21T02:00:00"),
      ),
    ).toBe(true);
  });

  it("keeps evening-to-midnight and same-day timed events in the timed grid", () => {
    expect(
      shouldRenderTimedInAllDayRow(
        dayjs("2026-05-20T22:00:00"),
        dayjs("2026-05-21T00:00:00"),
      ),
    ).toBe(false);
    expect(
      shouldRenderTimedInAllDayRow(
        dayjs("2026-05-20T10:00:00"),
        dayjs("2026-05-20T11:00:00"),
      ),
    ).toBe(false);
  });
});

describe("timedMultiDayToAllDayDates", () => {
  it("maps a Fri–Sat timed range to an exclusive Fri–Sun all-day span", () => {
    expect(
      timedMultiDayToAllDayDates(
        dayjs("2026-05-22T08:00:00"),
        dayjs("2026-05-23T18:00:00"),
      ),
    ).toEqual({ startDate: "2026-05-22", endDate: "2026-05-24" });
  });

  it("does not include the day after a midnight-exclusive end", () => {
    expect(
      timedMultiDayToAllDayDates(
        dayjs("2026-05-22T08:00:00"),
        dayjs("2026-05-25T00:00:00"),
      ),
    ).toEqual({ startDate: "2026-05-22", endDate: "2026-05-25" });
  });
});
