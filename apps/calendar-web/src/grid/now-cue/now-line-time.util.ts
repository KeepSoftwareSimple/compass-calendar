import { HOURS_AM_FORMAT } from "@core/constants/date.constants";
import {
  civilHourLineInstants,
  gridMinutesFromCivilMidnight,
} from "@core/util/date/civil-day";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  TIMED_EVENT_COLUMN_INSET,
  timedGridTopPercent,
} from "@web/grid/grid.constants";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

/** Wall-clock minutes near an hour label where the now-time label overlaps. */
export const NOW_TIME_LABEL_COLLISION_MINUTES = 12;

export function formatNowLineTimeLabel(now: Dayjs, timeZone: string): string {
  return inEffectiveTimeZone(now, timeZone).format(HOURS_AM_FORMAT);
}

export function nowLineGridMinutes(
  now: Dayjs = dayjs(),
  timeZone: string,
): number {
  return gridMinutesFromCivilMidnight(now, timeZone);
}

export function nowLineTopPercent(now: Dayjs, timeZone: string): number {
  return timedGridTopPercent(nowLineGridMinutes(now, timeZone));
}

export function hourLabelIndexOverlappingNow(
  nowGridMinutes: number,
  referenceDay: Dayjs,
  timeZone: string,
): number | null {
  const instants = civilHourLineInstants(referenceDay, timeZone, true);
  for (let index = 0; index < instants.length; index++) {
    const slotMinutes = gridMinutesFromCivilMidnight(instants[index], timeZone);
    if (
      Math.abs(nowGridMinutes - slotMinutes) <= NOW_TIME_LABEL_COLLISION_MINUTES
    ) {
      return index;
    }
  }
  return null;
}

export function nowTimeLabelPlacement(
  visibleDates: ReadonlyArray<{ date: Dayjs }>,
): "gutter" | "column-edge" {
  if (visibleDates.length <= 1) {
    return "gutter";
  }
  const firstDay = visibleDates[0]?.date.format("YYYY-MM-DD");
  const allSameDay = visibleDates.every(
    ({ date }) => date.format("YYYY-MM-DD") === firstDay,
  );
  return allSameDay ? "gutter" : "column-edge";
}

/** Layout-stable max width for the week now pill (longest `h:mm AM` label + padding). */
export const NOW_WEEK_TIME_LABEL_PILL_MAX_WIDTH_PX = 56;

/** Week view: first visible column uses the hour gutter instead of the column seam. */
export function weekNowTimeLabelUsesGutter(todayColumnIndex: number): boolean {
  return todayColumnIndex === 0;
}

/**
 * Whether the week now pill's right edge sits left of timed event content in
 * today's column (`TIMED_EVENT_COLUMN_INSET` from the column origin).
 */
export function weekNowTimeLabelClearsEventContent(
  todayColumnIndex: number,
): boolean {
  return (
    weekNowTimeLabelRightEdgePx(todayColumnIndex) <= TIMED_EVENT_COLUMN_INSET
  );
}

/** Right edge of the pill relative to today's column left edge (px, <= inset). */
export function weekNowTimeLabelRightEdgePx(todayColumnIndex: number): number {
  if (weekNowTimeLabelUsesGutter(todayColumnIndex)) {
    return -TIMED_EVENT_COLUMN_INSET - 1;
  }
  return 0;
}
