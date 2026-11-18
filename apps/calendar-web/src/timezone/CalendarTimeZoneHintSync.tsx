import { useLayoutEffect } from "react";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { syncCalendarTimeZoneHintFromCalendars } from "@web/timezone/calendar-timezone-hint";

/** Keeps the Auto effective zone aligned with connected calendar timezones. */
export function CalendarTimeZoneHintSync() {
  const { data: calendars } = useCalendarsQuery();

  useLayoutEffect(() => {
    syncCalendarTimeZoneHintFromCalendars(calendars);
  }, [calendars]);

  return null;
}
