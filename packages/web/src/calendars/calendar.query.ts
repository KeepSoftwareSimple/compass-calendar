import {
  type QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { CalendarApi } from "@web/api/calendar.api";
import { readAuthenticated } from "@web/auth/compass/session/auth-session.store";
import { useSession } from "@web/auth/compass/session/useSession";
import { applyClientVisibility } from "@web/calendars/apply-client-visibility";
import { useHiddenCalendarIds } from "@web/calendars/calendar-visibility.store";
import {
  getLocalCalendarSentinelId,
  isSentinelCalendarList,
  synthesizeLocalCalendar,
} from "@web/calendars/local-calendar.sentinel";

export const calendarQueryKeys = {
  all: ["calendars"] as const,
};

// Anonymous/offline mode never calls the API - it synthesizes the one local
// calendar from the sentinel id so downstream code (drafts, transitions)
// always has a calendar list to read from (B12). The raw server list here
// never carries client visibility - useCalendarsQuery's `select` overlays it
// on every read, so any writer of this cache (SSE upsert, mutation, test
// seeding) gets correct isVisible for free instead of needing to re-run
// applyClientVisibility itself.
export function calendarsQueryOptions(authenticated: boolean) {
  return queryOptions({
    queryKey: calendarQueryKeys.all,
    queryFn: async (): Promise<Calendar[]> => {
      // `authenticated` is the hook/loader argument. `readAuthenticated`
      // covers the gap before React re-renders after the session store flips,
      // so a still-mounted anonymous observer cannot write the sentinel back.
      if (!authenticated && !readAuthenticated()) {
        return [synthesizeLocalCalendar(getLocalCalendarSentinelId())];
      }

      return CalendarApi.list();
    },
    staleTime: 60_000,
  });
}

// ~20 call sites read this query. TanStack Query mounts a separate observer
// per useQuery() call site even when they share a queryKey, so a
// useCallback-per-consumer `select` (its previous form) both allocates a new
// function every render AND still runs applyClientVisibility's map+spread
// once per consumer, since each observer only caches against its own last
// select result. Cache the RESULT here, keyed on the (hiddenIds, data)
// reference pair - both are stable across renders until the underlying
// store/query data actually changes (see useHiddenCalendarIds and this
// query's staleTime) - so every consumer on the same versions gets back the
// exact same output array. That stable reference is also what
// useCalendarEventViewModel's memo keys on, so the event pipeline runs once
// per (data, calendars) rather than once per consumer.
const visibilityResultCache = new WeakMap<
  ReadonlySet<string>,
  WeakMap<Calendar[], Calendar[]>
>();

function selectVisibleCalendars(
  calendars: Calendar[],
  hiddenIds: ReadonlySet<string>,
): Calendar[] {
  let byData = visibilityResultCache.get(hiddenIds);
  if (!byData) {
    byData = new WeakMap();
    visibilityResultCache.set(hiddenIds, byData);
  }

  let result = byData.get(calendars);
  if (!result) {
    result = applyClientVisibility(calendars, hiddenIds);
    byData.set(calendars, result);
  }
  return result;
}

/**
 * Remote calendar list for event prefetch. Drops a fresh anonymous sentinel
 * first: staleTime would otherwise return it without calling the API.
 * Returns undefined when the fetch still produced only the sentinel.
 */
export async function ensureRemoteCalendars(
  client: QueryClient,
): Promise<Calendar[] | undefined> {
  const cached = client.getQueryData<Calendar[]>(calendarQueryKeys.all);
  if (cached && !isSentinelCalendarList(cached)) return cached;

  if (isSentinelCalendarList(cached)) {
    client.removeQueries({ queryKey: calendarQueryKeys.all });
  }

  const calendars = await client.fetchQuery(calendarsQueryOptions(true));
  if (isSentinelCalendarList(calendars)) return undefined;
  return calendars;
}

export function useCalendarsQuery() {
  const { authenticated } = useSession();
  const hiddenIds = useHiddenCalendarIds();
  const queryClient = useQueryClient();
  const query = useQuery({
    ...calendarsQueryOptions(authenticated),
    select: (calendars: Calendar[]) =>
      selectVisibleCalendars(calendars, hiddenIds),
  });

  // The calendars key stays `["calendars"]` so existing cache writers keep
  // working. Auth lives outside the key, and staleTime will not refetch when
  // the query function identity changes, so drop the sentinel explicitly once
  // a session exists.
  useEffect(() => {
    if (!authenticated && !readAuthenticated()) return;
    // A just-settled anonymous fetch bumps dataUpdatedAt while the cache is
    // still the sentinel. Reading it here re-runs this effect so that fetch
    // is replaced instead of sitting for staleTime.
    if (query.dataUpdatedAt === 0) return;
    const cached = queryClient.getQueryData<Calendar[]>(calendarQueryKeys.all);
    if (!isSentinelCalendarList(cached)) return;
    if (
      queryClient.getQueryState(calendarQueryKeys.all)?.fetchStatus ===
      "fetching"
    ) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all });
  }, [authenticated, query.dataUpdatedAt, queryClient]);

  return query;
}
