import { getTimesLabel } from "@web/common/utils/datetime/web.date.util";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { timeZoneCityName } from "@web/timezone/timezone-catalog";

export function eventFormScheduleTimeZoneHintText(
  eventTimeZone: string,
  start: Date,
  end: Date,
  displayTimeZone: string = getEffectiveTimeZone(),
): string | null {
  if (eventTimeZone === displayTimeZone) return null;
  const range = getTimesLabel(
    start.toISOString(),
    end.toISOString(),
    eventTimeZone,
  );
  return `${range} ${timeZoneCityName(eventTimeZone)}`;
}
