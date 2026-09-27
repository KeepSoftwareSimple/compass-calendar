import { QueryClient } from "@tanstack/react-query";

export const createCompassQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // `retry: false` alone still leaves ONE automatic retry path open:
        // every newly-mounting observer of an already-errored query refires
        // it. Queries here are read by many components at once (16 call
        // sites share calendarQueryKeys.all), and because each failed fetch
        // resolves before the next observer mounts, TanStack's in-flight
        // dedupe never catches them - a single unreachable backend turned
        // one page load into 16 sequential GET /calendars, which is exactly
        // the burst prod saw during the 2026-08-21 sync restart. Recovery
        // stays explicit: the "Retry" buttons on the calendar list and grid,
        // SSE-reopen invalidation, and any key change all still refetch.
        retryOnMount: false,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

export const queryClient = createCompassQueryClient();
