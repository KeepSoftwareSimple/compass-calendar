import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Dayjs } from "@core/util/date/dayjs";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { deriveOverlappingEventQueryData } from "@web/events/queries/event.query.cache";
import { weekEventsQueryOptions } from "@web/events/queries/event.query.options";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { useCalendarEventViewModel } from "./useCalendarEventViewModel";
import { useEventListCalendarIds } from "./useEventListCalendarIds";

type WeekEventsQueryArgs = {
  startOfView: Dayjs;
  endOfView: Dayjs;
};

/**
 * Primary week-events read hook. TanStack Query owns the normalized result;
 * consumers derive render data through {@link useWeekEventViewModel}.
 * Load failures are shown contextually (e.g. EventGrid) — no global toast.
 */
export function useWeekEventsQuery({
  startOfView,
  endOfView,
}: WeekEventsQueryArgs) {
  const queryClient = useQueryClient();
  const source = useEventRepositorySource();
  const { calendarIds, enabled } = useEventListCalendarIds();
  const startDate = toUTCOffset(startOfView);
  const endDate = toUTCOffset(endOfView);

  const query = useQuery({
    ...weekEventsQueryOptions({ source, startDate, endDate, calendarIds }),
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

export function useWeekEventViewModel(args: WeekEventsQueryArgs) {
  const query = useWeekEventsQuery(args);
  const viewModel = useCalendarEventViewModel(query.data);
  return { ...query, ...viewModel };
}
