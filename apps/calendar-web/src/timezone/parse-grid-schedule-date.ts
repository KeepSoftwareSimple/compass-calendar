import { type Dayjs } from "@core/util/date/dayjs";
import { parseGridDateTime } from "@core/util/date/parse-grid-datetime";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

/** Grid schedule string in the event zone, else the pinned calendar zone. */
export function parseGridScheduleDate(
  value: string,
  eventTimeZone?: string,
): Dayjs {
  return parseGridDateTime(value, eventTimeZone ?? getEffectiveTimeZone());
}
