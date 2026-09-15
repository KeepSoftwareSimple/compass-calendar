import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import { type Dayjs } from "@core/util/date/dayjs";
import { GRID_TIME_STEP } from "@web/grid/grid.constants";
import {
  calendarDateInEffectiveTimeZone,
  inEffectiveTimeZone,
} from "@web/timezone/in-time-zone";

export interface EventNudgeMovement {
  days: number;
  minutes: number;
}

export type EventNudgeStep = "fine" | "coarse";

const FINE_DAY_STEP = 1;
const COARSE_DAY_STEP = 7;
const COARSE_MINUTE_STEP = 60;

export const nudgeStepFromKeyboard = (
  event: Pick<KeyboardEvent, "altKey">,
): EventNudgeStep => (event.altKey ? "coarse" : "fine");

/** Start or end edge of an event, used by Tab edge-focus and Shift+arrow edge nudges. */
export type EventEdge = "startDate" | "endDate";

export const getArrowKeyMovement = (
  key: string,
  isAllDay: boolean,
  step: EventNudgeStep = "fine",
): EventNudgeMovement | null => {
  const days = step === "coarse" ? COARSE_DAY_STEP : FINE_DAY_STEP;
  const minutes = step === "coarse" ? COARSE_MINUTE_STEP : GRID_TIME_STEP;

  switch (key) {
    case "ArrowLeft":
      return { days: -days, minutes: 0 };
    case "ArrowRight":
      return { days, minutes: 0 };
    case "ArrowUp":
      return isAllDay ? null : { days: 0, minutes: -minutes };
    case "ArrowDown":
      return isAllDay ? null : { days: 0, minutes };
    default:
      return null;
  }
};

// Mirrors CROSS_ROW_TIMED_DURATION_MIN (grid/interaction/math/cross-row.drag.ts),
// the duration invented when a mouse drag converts an all-day event into the
// timed grid. Kept as a local constant to avoid a common-utils -> grid/interaction
// dependency for one shared number.
const CONVERTED_TIMED_DURATION_MIN = 60;

/**
 * All-day -> timed via Shift+ArrowDown. Mirrors the drag conversion: start of
 * day plus a caller-supplied visible start minute, fixed duration. A
 * multi-day span collapses onto its start day - the keyboard has no drop
 * column to say otherwise.
 */
export const convertAllDayToTimedDates = (
  event: Pick<CompassEvent, "startDate">,
  startMinute: number,
): { startDate: string; endDate: string } => {
  const start = calendarDateInEffectiveTimeZone(event.startDate ?? "")
    .startOf("day")
    .add(startMinute, "minute");
  return {
    startDate: start.format(),
    endDate: start.add(CONVERTED_TIMED_DURATION_MIN, "minute").format(),
  };
};

export const isTimedEventInsideOneDay = (start: Dayjs, end: Dayjs) => {
  const midnightAfterStart = start.add(1, "day").startOf("day");

  return end.isSame(start, "day") || end.isSame(midnightAfterStart);
};

/** Timed events that cross midnight render in the all-day row (Google-style). */
export const isTimedEventMultiDay = (start: Dayjs, end: Dayjs) =>
  !isTimedEventInsideOneDay(start, end);

/**
 * Timed events that cover exactly one calendar day as [midnight, next midnight)
 * — e.g. a Google dateTime full-day block. These stay `kind: "timed"` in storage
 * but should render in the all-day row instead of a full-height timed column.
 */
export const isTimedEventFullCalendarDay = (start: Dayjs, end: Dayjs) =>
  start.isSame(start.startOf("day")) &&
  end.isSame(start.add(1, "day").startOf("day"));

/** Timed events that belong in the all-day row for display (not storage). */
export const shouldRenderTimedInAllDayRow = (start: Dayjs, end: Dayjs) =>
  isTimedEventMultiDay(start, end) || isTimedEventFullCalendarDay(start, end);

/**
 * Maps a multi-day timed range onto an exclusive all-day date span for the
 * all-day row. Inclusive coverage is every calendar day that contains any
 * part of [start, end); exclusive end is the day after the last of those.
 */
export const timedMultiDayToAllDayDates = (
  start: Dayjs,
  end: Dayjs,
): { startDate: string; endDate: string } => {
  const endDayStart = end.startOf("day");
  const exclusiveEnd = end.isSame(endDayStart)
    ? endDayStart
    : endDayStart.add(1, "day");

  return {
    startDate: start.startOf("day").format(YEAR_MONTH_DAY_FORMAT),
    endDate: exclusiveEnd.format(YEAR_MONTH_DAY_FORMAT),
  };
};

export const nudgeEventDates = (
  event: Pick<CompassEvent, "startDate" | "endDate" | "isAllDay">,
  movement: EventNudgeMovement,
): { startDate: string; endDate: string } | null => {
  if (!event.startDate || !event.endDate) return null;
  if (event.isAllDay && movement.minutes !== 0) return null;

  const startDate = event.startDate;
  const endDate = event.endDate;
  const parse = event.isAllDay
    ? calendarDateInEffectiveTimeZone
    : inEffectiveTimeZone;
  const nextStart = parse(startDate)
    .add(movement.days, "day")
    .add(movement.minutes, "minutes");
  const nextEnd = parse(endDate)
    .add(movement.days, "day")
    .add(movement.minutes, "minutes");

  if (!event.isAllDay && !isTimedEventInsideOneDay(nextStart, nextEnd)) {
    return null;
  }

  if (event.isAllDay) {
    return {
      startDate: nextStart.format(YEAR_MONTH_DAY_FORMAT),
      endDate: nextEnd.format(YEAR_MONTH_DAY_FORMAT),
    };
  }

  return { startDate: nextStart.format(), endDate: nextEnd.format() };
};

/**
 * Shifts only one edge of a focused event by a single arrow-key step. Timed
 * events only accept minute movement (Up/Down); all-day events only accept
 * day movement (Left/Right) — the caller's `getArrowKeyMovement(key, isAllDay)`
 * already returns null for the other axis on all-day events, but timed events
 * still resolve day movement, so it's rejected here explicitly.
 *
 * Mirrors the mouse drag-resize flip (timed.resize.ts / all-day.resize.ts):
 * pushing an edge past the minimum duration swaps it to the other edge. Each
 * keystroke moves by exactly one step, so the flipped span is always exactly
 * one step wide.
 */
export const nudgeEventEdgeDates = (
  event: Pick<CompassEvent, "startDate" | "endDate" | "isAllDay">,
  edge: EventEdge,
  movement: EventNudgeMovement,
): { startDate: string; endDate: string; edge: EventEdge } | null => {
  const startDate = event.startDate;
  const endDate = event.endDate;
  if (!startDate || !endDate) return null;

  if (event.isAllDay) {
    if (movement.days === 0) return null;
    return nudgeAllDayEdgeDates({ startDate, endDate }, edge, movement.days);
  }

  if (movement.minutes === 0) return null;
  return nudgeTimedEdgeDates({ startDate, endDate }, edge, movement.minutes);
};

const nudgeTimedEdgeDates = (
  event: { startDate: string; endDate: string },
  edge: EventEdge,
  minutesDelta: number,
): { startDate: string; endDate: string; edge: EventEdge } | null => {
  const start = inEffectiveTimeZone(event.startDate);
  const end = inEffectiveTimeZone(event.endDate);

  if (edge === "startDate") {
    const candidateStart = start.add(minutesDelta, "minute");
    const latestStart = end.subtract(GRID_TIME_STEP, "minute");

    if (!candidateStart.isAfter(latestStart)) {
      if (!isTimedEventInsideOneDay(candidateStart, end)) return null;
      return {
        startDate: candidateStart.format(),
        endDate: end.format(),
        edge: "startDate",
      };
    }

    const flippedEnd = end.add(GRID_TIME_STEP, "minute");
    if (!isTimedEventInsideOneDay(end, flippedEnd)) return null;
    return {
      startDate: end.format(),
      endDate: flippedEnd.format(),
      edge: "endDate",
    };
  }

  const candidateEnd = end.add(minutesDelta, "minute");
  const earliestEnd = start.add(GRID_TIME_STEP, "minute");

  if (!candidateEnd.isBefore(earliestEnd)) {
    if (!isTimedEventInsideOneDay(start, candidateEnd)) return null;
    return {
      startDate: start.format(),
      endDate: candidateEnd.format(),
      edge: "endDate",
    };
  }

  const flippedStart = start.subtract(GRID_TIME_STEP, "minute");
  if (!isTimedEventInsideOneDay(flippedStart, start)) return null;
  return {
    startDate: flippedStart.format(),
    endDate: start.format(),
    edge: "startDate",
  };
};

const nudgeAllDayEdgeDates = (
  event: { startDate: string; endDate: string },
  edge: EventEdge,
  daysDelta: number,
): { startDate: string; endDate: string; edge: EventEdge } => {
  const startDay = calendarDateInEffectiveTimeZone(event.startDate).startOf(
    "day",
  );
  const inclusiveEnd = calendarDateInEffectiveTimeZone(event.endDate)
    .startOf("day")
    .subtract(1, "day");

  if (edge === "startDate") {
    const candidate = startDay.add(daysDelta, "day");
    const [nextStart, nextInclusiveEnd, nextEdge] = candidate.isAfter(
      inclusiveEnd,
    )
      ? ([inclusiveEnd, candidate, "endDate"] as const)
      : ([candidate, inclusiveEnd, "startDate"] as const);

    return {
      startDate: nextStart.format(YEAR_MONTH_DAY_FORMAT),
      endDate: nextInclusiveEnd.add(1, "day").format(YEAR_MONTH_DAY_FORMAT),
      edge: nextEdge,
    };
  }

  const candidate = inclusiveEnd.add(daysDelta, "day");
  const [nextStart, nextInclusiveEnd, nextEdge] = candidate.isBefore(startDay)
    ? ([candidate, startDay, "startDate"] as const)
    : ([startDay, candidate, "endDate"] as const);

  return {
    startDate: nextStart.format(YEAR_MONTH_DAY_FORMAT),
    endDate: nextInclusiveEnd.add(1, "day").format(YEAR_MONTH_DAY_FORMAT),
    edge: nextEdge,
  };
};
