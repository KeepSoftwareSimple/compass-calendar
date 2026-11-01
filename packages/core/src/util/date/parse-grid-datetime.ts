import dayjs, { type Dayjs } from "@core/util/date/dayjs";

const EXPLICIT_OFFSET_OR_Z = /(?:[Zz]|[+-]\d{2}:\d{2})$/;

/**
 * Parse a grid `startDate` / `endDate` string for overlap and positioning.
 *
 * Instants with `Z` or a numeric offset are parsed as absolute time, then
 * viewed in `timeZone`. Naive strings (no zone suffix) are wall-clock times
 * in `timeZone`, matching native {@link CompassDateParsing} behavior.
 */
export function parseGridDateTime(value: string, timeZone: string): Dayjs {
  const trimmed = value.trim();
  if (EXPLICIT_OFFSET_OR_Z.test(trimmed)) {
    return dayjs(trimmed).tz(timeZone);
  }

  return dayjs.tz(trimmed, timeZone);
}
