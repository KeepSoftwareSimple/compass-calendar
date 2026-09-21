import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deriveOverlappingEventQueryData } from "@web/events/queries/event.query.cache";
import { dayEventsQueryOptions } from "@web/events/queries/event.query.options";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { useCalendarEventViewModel } from "./useCalendarEventViewModel";
import { useEventListCalendarIds } from "./useEventListCalendarIds";
import { useRemoteEventsEnabled } from "./useRemoteEventsEnabled";

type DayEventsQueryArgs = {
  startDate: string;
  endDate: string;
};

export function useDayEventsQuery({ startDate, endDate }: DayEventsQueryArgs) {
  const queryClient = useQueryClient();
  const source = useEventRepositorySource();
  const calendarIds = useEventListCalendarIds();
  const enabled = useRemoteEventsEnabled(source);
  const query = useQuery({
    ...dayEventsQueryOptions({ source, startDate, endDate, calendarIds }),
    enabled,
    placeholderData: () =>
      deriveOverlappingEventQueryData(queryClient, {
        source,
        startDate,
        endDate,
      }),
  });
  return { ...query, calendarIds };
}

export function useDayEventViewModel(args: DayEventsQueryArgs) {
  const query = useDayEventsQuery(args);
  const viewModel = useCalendarEventViewModel(query.data);
  return { ...query, ...viewModel };
}
