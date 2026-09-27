import { useMemo } from "react";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { deriveEventListCalendarIds } from "./derive-event-list-calendar-ids";

/** Active calendar ids for event list reads. Visibility stays in the view. */
export function useEventListCalendarIds() {
  const { data: calendars } = useCalendarsQuery();
  return useMemo(() => deriveEventListCalendarIds(calendars), [calendars]);
}
