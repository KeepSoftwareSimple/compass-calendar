import { type Dayjs } from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  DAY_COLUMN_MIN_USABLE_WIDTH,
  GRID_MARGIN_LEFT,
} from "@web/grid/grid.constants";
import {
  calendarDateInEffectiveTimeZone,
  inEffectiveTimeZone,
} from "@web/timezone/in-time-zone";

export const WEEK_DAY_COUNT = 7;

/**
 * How many day columns fit in the week grid track without squishing events
 * below a readable width. The hour labels margin is part of the track, so it
 * is subtracted before dividing.
 */
export const computeVisibleDayCount = (
  trackWidth: number,
  marginLeft: number = GRID_MARGIN_LEFT,
) =>
  Math.min(
    Math.max(
      Math.floor((trackWidth - marginLeft) / DAY_COLUMN_MIN_USABLE_WIDTH),
      1,
    ),
    WEEK_DAY_COUNT,
  );

/**
 * Index of the first visible day within the week. The window centers on the
 * anchor day and clamps to the week boundaries, so a full-width window is
 * always offset 0.
 */
export const computeVisibleWindowOffset = ({
  anchorIndex,
  visibleDayCount,
}: {
  anchorIndex: number;
  visibleDayCount: number;
}) => {
  const maxOffset = Math.max(WEEK_DAY_COUNT - visibleDayCount, 0);
  const centered = anchorIndex - Math.floor((visibleDayCount - 1) / 2);
  return Math.min(Math.max(centered, 0), maxOffset);
};

/**
 * The anchor day that makes {@link computeVisibleWindowOffset} produce the
 * given offset (the center day of that window). Used by paging navigation to
 * express "move the window to this offset" in anchor terms.
 */
export const anchorDateForWindowOffset = ({
  weekStart,
  windowOffset,
  visibleDayCount,
}: {
  weekStart: Dayjs;
  windowOffset: number;
  visibleDayCount: number;
}) =>
  weekStart.add(windowOffset + Math.floor((visibleDayCount - 1) / 2), "day");

type EventDates = Pick<GridEvent, "startDate" | "endDate">;

/**
 * Timed events render in the column of their start date (mirrors
 * getTimedEventPosition), so visibility is start-date membership.
 */
export const isTimedEventInVisibleDays = (
  event: EventDates,
  visibleDays: Dayjs[],
) => {
  const start = inEffectiveTimeZone(event.startDate);
  return visibleDays.some((day) => day.isSame(start, "day"));
};

/**
 * All-day events store an exclusive end date; an event is visible when its
 * inclusive span overlaps the window (mirrors getAllDayEventPosition,
 * which clamps the span to the visible dates).
 */
export const isAllDayEventInVisibleDays = (
  event: EventDates,
  visibleDays: Dayjs[],
) => {
  const visibleStart = visibleDays[0]?.startOf("day");
  const visibleEnd = visibleDays[visibleDays.length - 1]?.startOf("day");
  if (!visibleStart || !visibleEnd) {
    return false;
  }

  const eventStart = calendarDateInEffectiveTimeZone(event.startDate).startOf(
    "day",
  );
  const exclusiveEnd = calendarDateInEffectiveTimeZone(event.endDate).startOf(
    "day",
  );
  const eventEnd = exclusiveEnd.isAfter(eventStart)
    ? exclusiveEnd.subtract(1, "day")
    : eventStart;

  return !eventEnd.isBefore(visibleStart) && !eventStart.isAfter(visibleEnd);
};
