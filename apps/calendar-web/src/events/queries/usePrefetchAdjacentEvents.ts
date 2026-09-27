import { type FetchQueryOptions, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { type EventsQueryArgs } from "./event.query.options";

type AdjacentRange = Omit<EventsQueryArgs, "source">;

/**
 * Warms the cache for the ranges adjacent to the one currently being read, so
 * the next prev/next navigation resolves from cache instead of paying a fresh
 * fetch. `queryOptionsFn` must be the same options builder (and `previous`/
 * `next` the same date-formatting) the corresponding read hook uses for the
 * current range, so the prefetched entries land under the exact keys a
 * subsequent read would look up — a mismatched format prefetches a phantom
 * entry the real read never finds.
 *
 * Prefetch waits until `enabled` is true (typically after the current range
 * has settled) so first paint does not compete with adjacent-week drains.
 *
 * `prefetchQuery` is a no-op for entries that are already cached and fresh
 * (within `staleTime`), so re-running this on every render is safe.
 */
export function usePrefetchAdjacentEvents<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends readonly unknown[],
>(
  queryOptionsFn: (
    args: EventsQueryArgs,
  ) => FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  previous: AdjacentRange,
  next: AdjacentRange,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const source = useEventRepositorySource();

  // Depends on the primitive startDate/endDate fields rather than the
  // previous/next objects themselves, which are recreated on every render at
  // the call sites; depending on the object reference would re-run (and
  // re-prefetch) every render instead of only when the actual range changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above.
  useEffect(() => {
    if (!enabled) return;
    void queryClient.prefetchQuery(queryOptionsFn({ source, ...previous }));
    void queryClient.prefetchQuery(queryOptionsFn({ source, ...next }));
  }, [
    queryClient,
    queryOptionsFn,
    source,
    enabled,
    previous.startDate,
    previous.endDate,
    previous.calendarIds,
    next.startDate,
    next.endDate,
    next.calendarIds,
  ]);
}
