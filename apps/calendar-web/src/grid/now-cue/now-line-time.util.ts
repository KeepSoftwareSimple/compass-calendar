import { HOURS_AM_FORMAT } from "@core/constants/date.constants";
import {
  civilHourLineInstants,
  gridMinutesFromCivilMidnight,
} from "@core/util/date/civil-day";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { timedGridTopPercent } from "@web/grid/grid.constants";
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
