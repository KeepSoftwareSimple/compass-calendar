import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { invalidateEventQueriesUnlessMutating } from "@web/events/queries/event.query.invalidation";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { onServerMessage } from "../client/sse.client";

// Sync appends one invalidation per applied pull and the backend's change-feed
// bridge forwards each as its own SSE message, so an account with many busy
// calendars receives pages of up to 100 calendarsChanged/eventsChanged pairs
// inside one 2s poll tick, for hours at a stretch. invalidateQueries() cancels
// the refetch already in flight and starts another (TanStack's cancelRefetch
// default). Event reads forward that abort signal to fetch, but a burst still
// starts one calendar-list read plus two event-range reads per message if we
// don't coalesce: those requests all ran to completion on the server before
// the abort was wired. Prod saw a single browser issue 900 event reads a
// minute this way, enough to push Sync past the backend's 5s read deadline
// and surface as 502s (#3694, #3695). Coalesce per message type: the first
// message in a quiet period refetches at once, anything that lands inside the
// window after it collapses into one trailing refetch.
export const SSE_REFETCH_COALESCE_MS = 5_000;

// Leading-edge + trailing-edge throttle. A plain trailing debounce would never
// fire while messages keep arriving faster than the window.
function coalesce(fn: () => void, windowMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  const fire = () => {
    fn();
    timer = setTimeout(() => {
      timer = null;
      if (pending) {
        pending = false;
        fire();
      }
    }, windowMs);
  };

  return {
    call: () => {
      if (timer) {
        pending = true;
        return;
      }
      fire();
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
}

/**
 * Refetches event reads when the backend pushes change events over SSE.
 * Invalidating the relevant scope refetches whichever query is active for the
 * current view/range - replacing the old view/date-range branching in useRefetch.
 */
export const useEventSSE = (coalesceMs = SSE_REFETCH_COALESCE_MS) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refetchEvents = coalesce(() => {
      invalidateEventQueriesUnlessMutating(
        queryClient,
        eventQueryKeys.scope("day"),
      );
      invalidateEventQueriesUnlessMutating(
        queryClient,
        eventQueryKeys.scope("week"),
      );
    }, coalesceMs);
    const refetchCalendars = coalesce(() => {
      void queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all });
    }, coalesceMs);

    const unsubscribeEvents = onServerMessage(
      "eventsChanged",
      refetchEvents.call,
    );
    const unsubscribeCalendars = onServerMessage(
      "calendarsChanged",
      refetchCalendars.call,
    );

    return () => {
      unsubscribeEvents();
      unsubscribeCalendars();
      refetchEvents.cancel();
      refetchCalendars.cancel();
    };
  }, [queryClient, coalesceMs]);
};
