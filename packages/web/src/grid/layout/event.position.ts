import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Dayjs } from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  DRAFT_PADDING_BOTTOM,
  EVENT_ALLDAY_GAP,
  EVENT_ALLDAY_HEIGHT,
  EVENT_ALLDAY_ROW_HEIGHT,
  EVENT_PADDING_RIGHT,
  TIMED_EVENT_COLUMN_INSET,
} from "@web/grid/grid.constants";
import { gridMarginLeftPx } from "@web/grid/grid-margin";
import {
  type EventPosition,
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";
import {
  calendarDateInEffectiveTimeZone,
  inEffectiveTimeZone,
} from "@web/timezone/in-time-zone";

export interface EventPositionInput {
  columnIndex?: number;
  isDraft: boolean;
  measurements: GridMeasurements;
  visibleDates: GridVisibleDate[];
}

export const getTimedEventPosition = (
  event: GridEvent,
  input: EventPositionInput,
): EventPosition => {
  const start = inEffectiveTimeZone(event.startDate);
  const end = inEffectiveTimeZone(event.endDate);
  const dateIndex =
    input.columnIndex ?? getVisibleDateIndex(start, input.visibleDates);
  if (dateIndex === null) {
    return zeroPosition();
  }

  const columnLeft = sumWidthsBefore(input.measurements.colWidths, dateIndex);
  const columnWidth = input.measurements.colWidths[dateIndex] ?? 0;
  const minutesFromStartOfDay = start.diff(start.startOf("day"), "minute");
  const durationMinutes = Math.max(15, end.diff(start, "minute"));
  const widthMultiplier = input.isDraft
    ? 1
    : (event.position?.widthMultiplier ?? 1);

  return {
    height:
      (durationMinutes / 60) * input.measurements.hourHeight -
      DRAFT_PADDING_BOTTOM,
    left: gridMarginLeftPx() + columnLeft + TIMED_EVENT_COLUMN_INSET,
    top: (minutesFromStartOfDay / 60) * input.measurements.hourHeight,
    width: Math.max(
      0,
      columnWidth * widthMultiplier - TIMED_EVENT_COLUMN_INSET * 2,
    ),
  };
};

export interface BusyPeriodPositionInput {
  columnIndex?: number;
  measurements: GridMeasurements;
  visibleDates: GridVisibleDate[];
}

/**
 * Positions an already day-clamped {start, end} segment, reusing the same
 * column/hour math as {@link getTimedEventPosition} (left/width from
 * colWidths, top/height from minutes-of-day) minus its widthMultiplier/deck
 * concerns - busy blocks never overlap-fan like event cards, they just
 * render at full column width. Callers (MainGridBusyPeriods /
 * DayCalendarBusyPeriods) clamp a possibly multi-day BusyPeriod to one day's
 * [00:00, 24:00) window per call via splitBusyPeriodsByDay before reaching
 * here, so `segment.start`/`segment.end` are always within a single day
 * (packet 08 phase 4; A7). A full-day busy range still renders as one tall
 * timed block per day rather than in the all-day row - acceptable for v1.
 */
export const getBusyPeriodPosition = (
  segment: { start: string; end: string },
  input: BusyPeriodPositionInput,
): EventPosition => {
  const start = inEffectiveTimeZone(segment.start);
  const end = inEffectiveTimeZone(segment.end);
  const dateIndex =
    input.columnIndex ?? getVisibleDateIndex(start, input.visibleDates);
  if (dateIndex === null) {
    return zeroPosition();
  }

  const columnLeft = sumWidthsBefore(input.measurements.colWidths, dateIndex);
  const columnWidth = input.measurements.colWidths[dateIndex] ?? 0;
  const minutesFromStartOfDay = start.diff(start.startOf("day"), "minute");
  const durationMinutes = Math.max(1, end.diff(start, "minute"));

  return {
    height: (durationMinutes / 60) * input.measurements.hourHeight,
    left: gridMarginLeftPx() + columnLeft + TIMED_EVENT_COLUMN_INSET,
    top: (minutesFromStartOfDay / 60) * input.measurements.hourHeight,
    width: Math.max(0, columnWidth - TIMED_EVENT_COLUMN_INSET * 2),
  };
};

export const getAllDayEventPosition = (
  event: GridEvent,
  input: EventPositionInput,
): EventPosition => {
  let left: number;
  let width: number;

  // Day view passes columnIndex: columns are calendars on one day, so the
  // caller already decided this event belongs on-screen. Skip the week-style
  // date-span clamp (which can zero-size a card when start/end are UTC
  // midnights that fall on the previous local day) and size to that column.
  if (input.columnIndex !== undefined) {
    const columnWidth = input.measurements.colWidths[input.columnIndex] ?? 0;
    left = sumWidthsBefore(input.measurements.colWidths, input.columnIndex);
    width = widthMinusPadding(columnWidth);
  } else {
    const span = getVisibleAllDaySpan(event, input.visibleDates);
    if (!span) {
      return zeroPosition();
    }

    const startIndex = getVisibleDateIndex(span.start, input.visibleDates);
    const endIndex = getVisibleDateIndex(span.end, input.visibleDates);
    if (startIndex === null || endIndex === null) {
      return zeroPosition();
    }

    left = sumWidthsBefore(input.measurements.colWidths, startIndex);
    width = widthMinusPadding(
      sumWidthsBetween(input.measurements.colWidths, startIndex, endIndex),
    );
  }

  return {
    height: EVENT_ALLDAY_HEIGHT,
    left,
    top: allDayEventTop(event.row),
    width,
  };
};

/** Rows are 1-based; top is 0-based with a small gap above the first chip. */
const allDayEventTop = (row: number | undefined) =>
  EVENT_ALLDAY_GAP + EVENT_ALLDAY_ROW_HEIGHT * ((row || 1) - 1);

const getVisibleAllDaySpan = (
  event: GridEvent,
  visibleDates: GridVisibleDate[],
) => {
  const visibleStart = visibleDates[0]?.date;
  if (!visibleStart) {
    return null;
  }

  const visibleEnd =
    visibleDates[visibleDates.length - 1]?.date ?? visibleStart;
  const eventStartKey = calendarDayKey(
    calendarDateInEffectiveTimeZone(event.startDate),
  );
  const exclusiveEndKey = calendarDayKey(
    calendarDateInEffectiveTimeZone(event.endDate),
  );
  const eventEndKey =
    exclusiveEndKey > eventStartKey
      ? calendarDayKey(
          calendarDateInEffectiveTimeZone(event.endDate).subtract(1, "day"),
        )
      : eventStartKey;
  const visibleStartKey = calendarDayKey(visibleStart);
  const visibleEndKey = calendarDayKey(visibleEnd);

  if (eventEndKey < visibleStartKey || eventStartKey > visibleEndKey) {
    return null;
  }

  const startKey =
    eventStartKey < visibleStartKey ? visibleStartKey : eventStartKey;
  const endKey = eventEndKey > visibleEndKey ? visibleEndKey : eventEndKey;
  const start = visibleDates.find(
    ({ date }) => calendarDayKey(date) === startKey,
  )?.date;
  const end = visibleDates.find(
    ({ date }) => calendarDayKey(date) === endKey,
  )?.date;

  if (!start || !end) {
    return null;
  }

  return { end, start };
};

const calendarDayKey = (date: Dayjs) => date.format(YEAR_MONTH_DAY_FORMAT);

const getVisibleDateIndex = (date: Dayjs, visibleDates: GridVisibleDate[]) => {
  if (visibleDates.length === 0) {
    return null;
  }

  const eventDay = calendarDayKey(date);
  const matchingIndex = visibleDates.findIndex(
    ({ date: visibleDate }) => calendarDayKey(visibleDate) === eventDay,
  );

  if (matchingIndex !== -1) {
    return matchingIndex;
  }

  return null;
};

const sumWidthsBefore = (widths: number[], dateIndex: number) =>
  widths
    .slice(0, Math.max(0, Math.min(dateIndex, widths.length)))
    .reduce((sum, width) => sum + width, 0);

const sumWidthsBetween = (
  widths: number[],
  startIndex: number,
  endIndex: number,
) => {
  if (endIndex < startIndex) {
    return 0;
  }

  return widths
    .slice(startIndex, endIndex + 1)
    .reduce((sum, width) => sum + width, 0);
};

const widthMinusPadding = (width: number) => {
  const adjustedWidth = width - EVENT_PADDING_RIGHT;

  return adjustedWidth < 0 ? width : adjustedWidth;
};

const zeroPosition = (): EventPosition => ({
  height: 0,
  left: 0,
  top: 0,
  width: 0,
});
