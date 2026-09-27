import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import { eventMutationKeys } from "@web/events/mutations/event.mutation.keys";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";

// A signal (SSE, mutation settle) that arrived while an event write was
// in-flight is never dropped — it's deferred here and flushed once nothing is
// mutating. Dropping it silently was the bug: an SSE `eventsChanged` that
// landed mid-mutation used to just vanish, and the client only reconciled by
// luck (window focus, a later unrelated navigation). Keyed by QueryClient
// (there is one per app) rather than a plain module boolean, so tests that
// construct their own client don't leak state into each other.
const owedInvalidation = new WeakMap<QueryClient, boolean>();

export const invalidateEventQueriesUnlessMutating = (
  queryClient: QueryClient,
  queryKey: QueryKey,
) => {
  if (queryClient.isMutating({ mutationKey: eventMutationKeys.all }) > 0) {
    owedInvalidation.set(queryClient, true);
    return;
  }
  void queryClient.invalidateQueries({ queryKey });
};

// Called from the mutation settle path once no event mutation remains
// in-flight. Flushes anything deferred above — the broad `eventQueryKeys.all`
// invalidation settle() already runs on this same path covers any narrower
// key an SSE signal targeted, so this only needs to record that a flush
// happened, not replay specific keys.
export const flushOwedEventInvalidation = (queryClient: QueryClient): void => {
  owedInvalidation.delete(queryClient);
};

// Whether an invalidation is owed — settle() consults this so a mutation that
// finishes while ANOTHER mutation is still in flight still commits to
// invalidating once the count truly reaches zero, rather than silently
// no-op'ing on a stale isMutating() snapshot (see settle()'s own docblock).
export const hasOwedEventInvalidation = (queryClient: QueryClient): boolean =>
  owedInvalidation.get(queryClient) ?? false;

// Mark that an invalidation is owed without attempting one now — used by
// settle() itself when it observes other mutations still in flight, so the
// intent survives until whichever mutation settles last.
export const markEventInvalidationOwed = (queryClient: QueryClient): void => {
  owedInvalidation.set(queryClient, true);
};

// Broad invalidation for settle() and owed-flag flush. Marks every event
// cache entry stale and refetches only active observers. Inactive ranges
// (prefetched neighbors, recently visited weeks) stay cached but refetch on
// the next observe/mount instead of eagerly refetching every window after
// each mutation.
export const invalidateAllEventQueries = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries({
    queryKey: eventQueryKeys.all,
    refetchType: "active",
  });
};
