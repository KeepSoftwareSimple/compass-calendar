import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { CalendarApi } from "@web/api/calendar.api";
import { useSession } from "@web/auth/compass/session/useSession";
import { applyClientVisibility } from "@web/calendars/apply-client-visibility";
import { useHiddenCalendarIds } from "@web/calendars/calendar-visibility.store";
import {
  getLocalCalendarSentinelId,
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
//
// The key stays `["calendars"]` so mutation reads and test seeds keep working.
// `useCalendarsQuery` removes this entry on the anonymous-to-authenticated
// transition; otherwise staleTime would keep the sentinel for 60s after login.
export function calendarsQueryOptions(authenticated: boolean) {
  return queryOptions({
    queryKey: calendarQueryKeys.all,
    queryFn: async (): Promise<Calendar[]> => {
      if (!authenticated) {
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

export function useCalendarsQuery() {
  const { authenticated } = useSession();
  const hiddenIds = useHiddenCalendarIds();
  const queryClient = useQueryClient();
  const previousAuthenticated = useRef(authenticated);

  // Drop the anonymous sentinel the moment auth resolves so it cannot linger
  // under `["calendars"]` prefix observers or seeded exact-key reads.
  useLayoutEffect(() => {
    if (previousAuthenticated.current === false && authenticated) {
      queryClient.removeQueries({ queryKey: calendarQueryKeys.all });
    }
    previousAuthenticated.current = authenticated;
  }, [authenticated, queryClient]);

  return useQuery({
    ...calendarsQueryOptions(authenticated),
    select: (calendars: Calendar[]) =>
      selectVisibleCalendars(calendars, hiddenIds),
  });
}
