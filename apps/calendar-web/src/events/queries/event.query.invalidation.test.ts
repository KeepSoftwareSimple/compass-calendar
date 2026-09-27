import { QueryClient } from "@tanstack/react-query";
import { eventMutationKeys } from "@web/events/mutations/event.mutation.keys";
import {
  flushOwedEventInvalidation,
  hasOwedEventInvalidation,
  invalidateAllEventQueries,
  invalidateEventQueriesUnlessMutating,
  markEventInvalidationOwed,
} from "./event.query.invalidation";
import { eventQueryKeys } from "./event.query.keys";
import { describe, expect, mock, test } from "bun:test";

const buildPendingMutation = (queryClient: QueryClient) =>
  queryClient
    .getMutationCache()
    .build(queryClient, {
      mutationKey: eventMutationKeys.operation("replace"),
      mutationFn: () => new Promise(() => undefined),
    })
    .execute(undefined);

describe("invalidateEventQueriesUnlessMutating", () => {
  test("invalidates immediately when no event write is pending", () => {
    const queryClient = new QueryClient();
    const invalidateQueries = mock(() => Promise.resolve());
    queryClient.invalidateQueries = invalidateQueries;

    invalidateEventQueriesUnlessMutating(queryClient, eventQueryKeys.all);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: eventQueryKeys.all,
    });
  });

  test("leaves the optimistic cache alone while an event write is pending", () => {
    const queryClient = new QueryClient();
    const invalidateQueries = mock(() => Promise.resolve());
    queryClient.invalidateQueries = invalidateQueries;
    buildPendingMutation(queryClient);

    invalidateEventQueriesUnlessMutating(queryClient, eventQueryKeys.all);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  // The regression lock for the old bug: a signal that arrived while mutating
  // used to just vanish (dropped, not deferred) — the client only reconciled
  // by luck (window focus, an unrelated later refetch).
  test("defers rather than drops a signal that arrives while mutating", () => {
    const queryClient = new QueryClient();
    buildPendingMutation(queryClient);

    invalidateEventQueriesUnlessMutating(queryClient, eventQueryKeys.all);

    expect(hasOwedEventInvalidation(queryClient)).toBe(true);
  });
});

describe("owed event invalidation", () => {
  test("markEventInvalidationOwed records intent for a later flush", () => {
    const queryClient = new QueryClient();

    markEventInvalidationOwed(queryClient);

    expect(hasOwedEventInvalidation(queryClient)).toBe(true);
  });

  test("flushOwedEventInvalidation clears the owed flag", () => {
    const queryClient = new QueryClient();
    markEventInvalidationOwed(queryClient);

    flushOwedEventInvalidation(queryClient);

    expect(hasOwedEventInvalidation(queryClient)).toBe(false);
  });

  test("keeps owed state independent per QueryClient", () => {
    const clientA = new QueryClient();
    const clientB = new QueryClient();

    markEventInvalidationOwed(clientA);

    expect(hasOwedEventInvalidation(clientA)).toBe(true);
    expect(hasOwedEventInvalidation(clientB)).toBe(false);
  });
});

describe("invalidateAllEventQueries", () => {
  test("invalidates the broad event key with refetchType active", () => {
    const queryClient = new QueryClient();
    const invalidateQueries = mock(() => Promise.resolve());
    queryClient.invalidateQueries = invalidateQueries;

    invalidateAllEventQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: eventQueryKeys.all,
      refetchType: "active",
    });
  });
});
