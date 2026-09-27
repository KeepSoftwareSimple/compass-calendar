import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { findEventInCache, isEventQueryKey } from "./event.query.cache";

export function useEventById(eventId?: string) {
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();
  return useSyncExternalStore(
    (onStoreChange) =>
      // Only re-run the (whole-cache) scan when an *event* query changed.
      // The default subscription fires for every cache event (config, auth,
      // unrelated reads), so filtering by key avoids a full findEventInCache
      // scan on cache activity that can never affect this event.
      queryCache.subscribe((notifyEvent) => {
        if (isEventQueryKey(notifyEvent.query.queryKey)) onStoreChange();
      }),
    () => (eventId ? findEventInCache(queryClient, eventId) : null),
    () => null,
  );
}
