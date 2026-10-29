import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { parseGridDateTime } from "@core/util/date/parse-grid-datetime";

const CIVIL_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function civilDateKey(day: Dayjs | Date | string, timeZone: string): string {
  if (typeof day === "string" && CIVIL_DATE_KEY.test(day.trim())) {
    return day.trim();
  }
  return dayjs(day).tz(timeZone).format("YYYY-MM-DD");
}

/** Midnight at the start of `day` in `timeZone` (calendar date from `day`). */
export function startOfCivilDay(
  day: Dayjs | Date | string,
  timeZone: string,
): Dayjs {
  const key = civilDateKey(day, timeZone);
  return dayjs.tz(key, timeZone).startOf("day");
}

/** Minutes from civil midnight to the next civil midnight (1380, 1440, or 1500). */
export function civilDayLengthMinutes(
  day: Dayjs | Date | string,
  timeZone: string,
): number {
  const start = startOfCivilDay(day, timeZone);
  const nextKey = start.add(1, "day").format("YYYY-MM-DD");
  const nextMidnight = dayjs.tz(nextKey, timeZone).startOf("day");
  return nextMidnight.diff(start, "minute");
}

/** Hour-sized slots in a civil day (23 on spring-forward, 25 on fall-back). */
export function civilHourSlotCount(
  day: Dayjs | Date | string,
  timeZone: string,
): number {
  return civilDayLengthMinutes(day, timeZone) / 60;
}

/** Longest civil day among `days` (25 on a US fall-back week, 23 on spring-forward). */
export function maxCivilHourSlotCount(
  days: readonly (Dayjs | Date | string)[],
  timeZone: string,
): number {
  if (days.length === 0) {
    return 24;
  }
  return Math.max(...days.map((day) => civilHourSlotCount(day, timeZone)));
}

/** Minutes from civil midnight for `instant` in `timeZone`. */
export function minutesFromCivilMidnight(
  instant: Dayjs | Date | string,
  timeZone: string,
): number {
  const zoned = dayjs(instant).tz(timeZone);
  return zoned.diff(startOfCivilDay(zoned, timeZone), "minute");
}

/**
 * Minutes from civil midnight for timed grid layout (hour labels and events).
 * Matches {@link civilHourLineInstants} on spring-forward days; keeps elapsed
 * minutes through the repeated hour on fall-back days.
 */
export function gridMinutesFromCivilMidnight(
  instant: Dayjs | Date | string,
  timeZone: string,
): number {
  const zoned = dayjs(instant).tz(timeZone);
  const start = startOfCivilDay(zoned, timeZone);
  const byElapsed = zoned.diff(start, "minute");
  const byWallClock = zoned.hour() * 60 + zoned.minute();
  if (byElapsed === byWallClock) {
    return byElapsed;
  }

  const slots = civilHourSlotCount(zoned, timeZone);
  if (slots === 23) {
    return byWallClock;
  }
  if (slots === 25) {
    const daylightOffset = start.utcOffset();
    const inRepeatedHour =
      zoned.hour() === 1 && zoned.utcOffset() < daylightOffset;
    if (inRepeatedHour) {
      return byElapsed;
    }
    if (byElapsed > byWallClock) {
      return byWallClock;
    }
    return byElapsed;
  }

  return byElapsed;
}

/**
 * Hour-line instants after civil midnight (1 AM through 11 PM, plus the next
 * midnight when `includeMidnight` is true). Slot count follows DST.
 */
export function civilHourLineInstants(
  day: Dayjs | Date | string,
  timeZone: string,
  includeMidnight = false,
): Dayjs[] {
  const slotCount = civilHourSlotCount(day, timeZone);
  const hours = includeMidnight ? slotCount : Math.max(0, slotCount - 1);
  const start = startOfCivilDay(day, timeZone);
  return Array.from({ length: hours }, (_, index) =>
    start.add(index + 1, "hour"),
  );
}

/** RFC3339 string for an instant in `timeZone` (dayjs default format). */
export function formatInstantInTimeZone(
  iso: string | Date,
  timeZone: string,
): string {
  if (iso instanceof Date) {
    return dayjs(iso).tz(timeZone).format();
  }
  return parseGridDateTime(iso, timeZone).format();
}
