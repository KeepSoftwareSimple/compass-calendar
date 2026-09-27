import { readAuthenticated } from "@web/auth/compass/session/auth-session.store";
import { useSession } from "@web/auth/compass/session/useSession";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { isSentinelCalendarList } from "@web/calendars/local-calendar.sentinel";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";

/**
 * Remote event reads wait until the calendar list belongs to the signed-in
 * session. The anonymous sentinel shares the calendars cache key, and a
 * request fired against it would carry the client-only id, then refetch.
 * Local IndexedDB reads do not wait.
 */
export function useRemoteEventsEnabled(source: EventRepositorySource): boolean {
  const { authenticated } = useSession();
  const calendars = useCalendarsQuery();
  if (source !== "remote") return true;

  return (
    (authenticated || readAuthenticated()) &&
    calendars.isSuccess &&
    !isSentinelCalendarList(calendars.data)
  );
}
