import { HOURS_AM_FORMAT } from "@core/constants/date.constants";
import {
  civilHourLineInstants,
  gridMinutesFromCivilMidnight,
} from "@core/util/date/civil-day";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { timedGridTopPercent } from "@web/grid/grid.constants";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

/** Gutter now-time label line box (`text-[10px] leading-none`). */
export const NOW_TIME_GUTTER_LABEL_HEIGHT_PX = 10;
/** Hour gutter label line box (`text-[10px]` at the top of each hour row). */
export const HOUR_GUTTER_LABEL_HEIGHT_PX = 10;
/** Extra px kept clear around the now label when deciding hour-label overlap. */
export const NOW_TIME_LABEL_COLLISION_MARGIN_PX = 2;
/**
 * Smallest expected timed hour row height (`viewport / TIMED_VISIBLE_HOURS`).
 * Using the minimum keeps hide ranges conservative across viewport sizes.
 */
export const MIN_TIMED_HOUR_SLOT_HEIGHT_PX = 30;

function nowTimeLabelOverlapsHourLine(
  nowGridMinutes: number,
  hourSlotMinutes: number,
  hourSlotHeightPx: number,
): boolean {
  const deltaMinutes = nowGridMinutes - hourSlotMinutes;
  const beforeMinutes =
    ((NOW_TIME_GUTTER_LABEL_HEIGHT_PX / 2 +
      NOW_TIME_LABEL_COLLISION_MARGIN_PX) /
      hourSlotHeightPx) *
    60;
  const afterMinutes =
    ((NOW_TIME_GUTTER_LABEL_HEIGHT_PX / 2 +
      HOUR_GUTTER_LABEL_HEIGHT_PX +
      NOW_TIME_LABEL_COLLISION_MARGIN_PX) /
      hourSlotHeightPx) *
    60;
  if (deltaMinutes >= 0) {
    return deltaMinutes < afterMinutes;
  }
  return -deltaMinutes < beforeMinutes;
}

/** Day gutter and day-view labels (`7:37 AM`). */
export function formatNowLineTimeLabel(now: Dayjs, timeZone: string): string {
  return inEffectiveTimeZone(now, timeZone).format(HOURS_AM_FORMAT);
}

/** Compact week seam pill without AM/PM (`7:37`). */
export function formatNowLineWeekPillLabel(
  now: Dayjs,
  timeZone: string,
): string {
  return inEffectiveTimeZone(now, timeZone).format("h:mm");
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
      nowTimeLabelOverlapsHourLine(
        nowGridMinutes,
        slotMinutes,
        MIN_TIMED_HOUR_SLOT_HEIGHT_PX,
      )
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

/** Layout-stable width for the compact week pill (`12:59` + padding). */
export const NOW_WEEK_TIME_LABEL_PILL_WIDTH_PX = 34;

/** Week view: first visible column uses the hour gutter instead of the column seam. */
export function weekNowTimeLabelUsesGutter(todayColumnIndex: number): boolean {
  return todayColumnIndex === 0;
}
