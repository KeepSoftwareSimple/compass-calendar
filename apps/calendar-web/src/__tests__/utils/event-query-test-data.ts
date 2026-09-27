import { type QueryClient } from "@tanstack/react-query";
import { type Event } from "@core/types/event.contracts";
import {
  type EventMutationOperation,
  eventMutationKeys,
} from "@web/events/mutations/event.mutation.keys";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { normalizeEventList } from "@web/events/queries/event.query.normalize";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";

/**
 * Builds the normalized `{ ids, entities }` shape the event query caches store.
 * Shared by the render test harnesses so they seed the cache identically to
 * the real read pipeline (see event.query.normalize.ts). Fixtures must be
 * strict `Event` contract objects — build them with
 * apps/calendar-web/src/__tests__/utils/factories/event.factory.ts.
 */
export const toNormalizedEventQueryData = (
  events: Event[],
): NormalizedEventQueryData => normalizeEventList(events);

/**
 * First-class query-seeding entry point for tests: registers the given events
 * as `initialData` for every event read scope (day/week), so any event
 * query a component mounts resolves from the cache.
 */
export const seedEventQueries = (queryClient: QueryClient, events: Event[]) => {
  queryClient.setQueryDefaults(eventQueryKeys.all, {
    initialData: toNormalizedEventQueryData(events),
  });
};

/**
 * Seeds an in-flight (status "pending") mutation into the mutation cache for
 * each event id, so hooks deriving pending state from TanStack Query mutation
 * state (e.g. `useHasPendingEventMutations`) see the events as syncing.
 */
export const seedPendingEventMutations = (
  queryClient: QueryClient,
  eventIds: string[],
  operation: EventMutationOperation = "replace",
) => {
  for (const eventId of eventIds) {
    queryClient.getMutationCache().build(
      queryClient,
      { mutationKey: eventMutationKeys.operation(operation) },
      {
        context: undefined,
        data: undefined,
        error: null,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        status: "pending",
        variables: { _id: eventId },
        submittedAt: Date.now(),
      },
    );
  }
};
