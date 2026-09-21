import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type Dayjs } from "@core/util/date/dayjs";
import { isBackendUnavailableError } from "@web/api/util/backend-unavailable-error.util";
import { setAuthSessionAuthenticated } from "@web/auth/compass/session/auth-session.store";
import {
  calendarQueryKeys,
  ensureRemoteCalendars,
} from "@web/calendars/calendar.query";
import { isSentinelCalendarList } from "@web/calendars/local-calendar.sentinel";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import { getEventRepositoryBySource } from "@web/events/repositories/event.repository.util";
import { fetchDayEvents } from "./day.event.query";
import { deriveEventListCalendarIds } from "./derive-event-list-calendar-ids";
import { eventQueryKeys } from "./event.query.keys";
import { fetchWeekEvents } from "./week.event.query";

/**
 * Shared cache policy for event reads. `staleTime` lets back-navigation to a
 * recently viewed range render instantly from cache; mutations and SSE still
 * invalidate explicitly. Window-focus refetch covers gaps a laptop sleep /
 * native SSE reconnect may miss while `retry: false` left a failed fetch idle.
 */
const EVENT_QUERY_CACHE_OPTIONS = {
  staleTime: 2 * 60 * 1000, // 2 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
  // "always": staleTime would otherwise skip focus refetch for 2 minutes and
  // leave a missed SSE/sleep gap on screen.
  refetchOnWindowFocus: "always" as const,
  // Event reads are the calendar's primary content. A short proxy restart or
  // Wi-Fi transition should recover in place instead of replacing cached
  // cloud data with an empty IndexedDB result and leaving the query idle.
  retry: (failureCount: number, error: Error) =>
    failureCount < 3 && isBackendUnavailableError(error),
  retryDelay: (attemptIndex: number) =>
    Math.min(1000 * 2 ** attemptIndex, 4000),
};

export type EventsQueryArgs = {
  source: EventRepositorySource;
  startDate: string;
  endDate: string;
  calendarIds?: CalendarId[];
};

type RangeFetch = typeof fetchDayEvents;

function rangeEventsQueryOptions(
  scope: "day" | "week",
  fetchFn: RangeFetch,
  { source, startDate, endDate, calendarIds }: EventsQueryArgs,
) {
  return queryOptions({
    queryKey: eventQueryKeys[scope]({
      source,
      start: startDate,
      end: endDate,
      calendarIds,
    }),
    queryFn: ({ signal }) =>
      fetchFn(
        { startDate, endDate, calendarIds },
        getEventRepositoryBySource(source),
        source,
        signal,
      ),
    ...EVENT_QUERY_CACHE_OPTIONS,
  });
}

export function dayEventsQueryOptions(args: EventsQueryArgs) {
  return rangeEventsQueryOptions("day", fetchDayEvents, args);
}

export function weekEventsQueryOptions(args: EventsQueryArgs) {
  return rangeEventsQueryOptions("week", fetchWeekEvents, args);
}

/**
 * View-range wrapper around {@link weekEventsQueryOptions}. The week read
 * hook and the week route-loader prefetch share this so the in-flight
 * request lands under the key the view will read.
 */
export function weekEventsViewQueryOptions({
  startOfView,
  endOfView,
  source,
  calendarIds,
}: {
  startOfView: Dayjs;
  endOfView: Dayjs;
  source: EventRepositorySource;
  calendarIds?: CalendarId[];
}) {
  return weekEventsQueryOptions({
    source,
    startDate: toUTCOffset(startOfView),
    endDate: toUTCOffset(endOfView),
    calendarIds,
  });
}

/**
 * Route prefetch for a day or week window. Remote reads wait for a real
 * calendar list so the request that fills the view's query key carries
 * server ids. Visibility is not part of that key, so this prefetch and the
 * later hook share one entry.
 */
export function prefetchRangeEvents(
  client: QueryClient,
  source: EventRepositorySource,
  authenticated: boolean,
  optionsFor: (
    calendarIds?: CalendarId[],
  ) => ReturnType<typeof dayEventsQueryOptions>,
): void {
  if (authenticated) setAuthSessionAuthenticated(true);

  const start = (calendarIds?: CalendarId[]) => {
    void client.prefetchQuery(optionsFor(calendarIds)).catch(() => undefined);
  };

  if (source !== "remote") {
    start();
    return;
  }

  const cached = client.getQueryData<Calendar[]>(calendarQueryKeys.all);
  if (cached && !isSentinelCalendarList(cached)) {
    start(deriveEventListCalendarIds(cached));
    return;
  }

  void ensureRemoteCalendars(client)
    .then((calendars) => {
      if (!calendars) return;
      start(deriveEventListCalendarIds(calendars));
    })
    .catch(() => undefined);
}
