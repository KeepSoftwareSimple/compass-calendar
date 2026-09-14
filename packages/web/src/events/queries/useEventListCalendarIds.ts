import { useMemo } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { isSynthesizedLocalCalendarList } from "@web/calendars/local-calendar.sentinel";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { deriveEventListCalendarIds } from "./derive-event-list-calendar-ids";

/**
 * Active calendar ids for event list reads, plus whether the remote events
 * query may fire. Visibility stays out of the events key: the view model
 * filters hidden calendars after the full active set is fetched.
 */
export function useEventListCalendarIds() {
  const { authenticated } = useSession();
  const source = useEventRepositorySource();
  const { data: calendars, isSuccess } = useCalendarsQuery();
  const calendarIds = useMemo(
    () => deriveEventListCalendarIds(calendars),
    [calendars],
  );

  const enabled =
    source !== "remote" ||
    (authenticated &&
      isSuccess &&
      calendarIds !== undefined &&
      !isSynthesizedLocalCalendarList(calendars));

  return { calendarIds, enabled };
}
