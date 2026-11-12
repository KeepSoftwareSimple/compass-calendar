import { useLayoutEffect } from "react";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { pickCalendarTimeZoneHint } from "@web/timezone/calendar-timezone-hint";
import { setCalendarTimeZoneHint } from "@web/timezone/effective-timezone.store";

/** Keeps the Auto effective zone aligned with connected calendar timezones. */
export function CalendarTimeZoneHintSync() {
  const { data: calendars } = useCalendarsQuery();

  useLayoutEffect(() => {
    setCalendarTimeZoneHint(
      calendars ? pickCalendarTimeZoneHint(calendars) : null,
    );
  }, [calendars]);

  return null;
}
