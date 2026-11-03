import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { parseGridDateTime } from "@core/util/date/parse-grid-datetime";

const CIVIL_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/*
 * Everything here must give the same answer whatever zone the host runs in.
 * The dayjs timezone plugin's `startOf` and `add` on a zoned value go through
 * the host's local zone, so on a US browser they shift by an hour across a
 * DST change while CI (TZ=Etc/UTC) never sees it. Do the arithmetic on epoch
 * milliseconds and plain calendar dates instead.
 */

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
  return dayjs.tz(key, timeZone);
}

/**
 * `hour`:`minute` wall-clock time on the calendar date of `day` in `timeZone`.
 *
 * Use this instead of `.hour(h).minute(m)` on a zoned value: the timezone
 * plugin keeps the original UTC offset when setting fields, so on a DST
 * change day `startOf("day").hour(14)` lands at 13:00 (fall-back) or 15:00
 * (spring-forward). A time inside the spring-forward gap moves forward.
 */
export function atCivilTime(
  day: Dayjs | Date | string,
  timeZone: string,
  hour: number,
  minute = 0,
): Dayjs {
  const pad = (value: number) => String(value).padStart(2, "0");
  return dayjs.tz(
    `${civilDateKey(day, timeZone)}T${pad(hour)}:${pad(minute)}:00`,
    timeZone,
  );
}

function nextCivilDateKey(key: string): string {
  return dayjs.utc(key).add(1, "day").format("YYYY-MM-DD");
}

/** Minutes from civil midnight to the next civil midnight (1380, 1440, or 1500). */
export function civilDayLengthMinutes(
  day: Dayjs | Date | string,
  timeZone: string,
): number {
  const key = civilDateKey(day, timeZone);
  const start = dayjs.tz(key, timeZone);
  const nextMidnight = dayjs.tz(nextCivilDateKey(key), timeZone);
  return Math.round((nextMidnight.valueOf() - start.valueOf()) / MS_PER_MINUTE);
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
 *
 * Each line is a real elapsed hour after midnight, held at midnight's UTC
 * offset so the gutter reads 1 AM through 11 PM in wall-clock order (with the
 * extra fall-back slot at the end), matching {@link gridMinutesFromCivilMidnight}.
 */
export function civilHourLineInstants(
  day: Dayjs | Date | string,
  timeZone: string,
  includeMidnight = false,
): Dayjs[] {
  const slotCount = civilHourSlotCount(day, timeZone);
  const hours = includeMidnight ? slotCount : Math.max(0, slotCount - 1);
  const start = startOfCivilDay(day, timeZone);
  const startMs = start.valueOf();
  const offset = start.utcOffset();
  return Array.from({ length: hours }, (_, index) =>
    dayjs(startMs + (index + 1) * MS_PER_HOUR).utcOffset(offset),
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
