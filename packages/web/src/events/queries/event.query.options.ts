import { queryOptions } from "@tanstack/react-query";
import { type CalendarId } from "@core/types/domain-primitives";
import { isBackendUnavailableError } from "@web/api/util/backend-unavailable-error.util";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import { RemoteEventRepository } from "@web/events/repositories/remote.event.repository";
import { fetchDayEvents } from "./day.event.query";
import { eventQueryKeys } from "./event.query.keys";

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
    queryFn: async ({ signal }) => {
      if (source === "local") {
        const { fetchLocalEventsRange } = await import("./event.query.local");
        return fetchLocalEventsRange({ startDate, endDate });
      }
      return fetchFn(
        { startDate, endDate, calendarIds },
        new RemoteEventRepository(),
        source,
        signal,
      );
    },
    ...EVENT_QUERY_CACHE_OPTIONS,
  });
}

export function dayEventsQueryOptions(args: EventsQueryArgs) {
  return rangeEventsQueryOptions("day", fetchDayEvents, args);
}

export function weekEventsQueryOptions(args: EventsQueryArgs) {
  return rangeEventsQueryOptions("week", fetchDayEvents, args);
}
