import { type QueryClient } from "@tanstack/react-query";
import { hiddenEventsQueryKeys } from "@web/events/hidden/hidden-events.query";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";

export const seedHiddenEventIds = (
  queryClient: QueryClient,
  ids: readonly string[],
  source: EventRepositorySource = "local",
) => {
  queryClient.setQueryData(hiddenEventsQueryKeys.source(source), ids);
};
