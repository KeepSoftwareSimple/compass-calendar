import dayjs from "@core/util/date/dayjs";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

/** Reinterpret an instant in the calendar's effective timezone. */
export function inEffectiveTimeZone(
  input: string | number | Date | dayjs.Dayjs,
  timeZone: string = getEffectiveTimeZone(),
): dayjs.Dayjs {
  return dayjs(input).tz(timeZone);
}

/** Parse a date-only (`YYYY-MM-DD`) value as midnight in the effective zone. */
export function calendarDateInEffectiveTimeZone(
  ymd: string,
  timeZone: string = getEffectiveTimeZone(),
): dayjs.Dayjs {
  return dayjs.tz(ymd, timeZone);
}
