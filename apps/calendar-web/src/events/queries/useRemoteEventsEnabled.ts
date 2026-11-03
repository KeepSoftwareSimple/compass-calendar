import { useSyncExternalStore } from "react";
import {
  readAuthenticated,
  readSessionResolved,
  subscribeSessionResolved,
} from "@web/auth/compass/session/auth-session.store";
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

/**
 * True when remote reads can never start: the session check has settled with
 * no session, so the disabled query would sit in `pending` forever. Grids use
 * this to drop the "Loading events" state while the login prompt takes over
 * (#5033). Before the check settles a valid session may still appear, so the
 * loader keeps showing.
 */
export function useRemoteEventsAwaitingSignIn(
  source: EventRepositorySource,
): boolean {
  const { authenticated } = useSession();
  const sessionResolved = useSyncExternalStore(
    subscribeSessionResolved,
    readSessionResolved,
  );
  if (source !== "remote") return false;

  return sessionResolved && !authenticated && !readAuthenticated();
}
