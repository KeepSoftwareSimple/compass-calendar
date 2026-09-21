import { type QueryClient } from "@tanstack/react-query";
import dayjs from "@core/util/date/dayjs";
import { queryClient as defaultQueryClient } from "@web/api/query-client";
import { dayEventsQueryOptions } from "@web/events/queries/event.query.options";
import { getEventRepositorySource } from "@web/events/repositories/event.repository.util";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { dayEventQueryRange } from "@web/views/Day/util/day-window.util";

/**
 * Start the day-events query before the lazy DayViewContent chunk resolves,
 * mirroring prefetchWeekEventsQuery so /day overlaps its chunk fetch and
 * data fetch instead of running them serially.
 */
export function prefetchDayEventsQuery({
  dateString,
  authenticated,
  client = defaultQueryClient,
}: {
  dateString: string;
  authenticated: boolean;
  client?: QueryClient;
}): void {
  const { startDate, endDate } = dayEventQueryRange(
    dayjs.tz(dateString, getEffectiveTimeZone()),
  );
  void client
    .prefetchQuery(
      dayEventsQueryOptions({
        startDate,
        endDate,
        source: getEventRepositorySource(authenticated),
      }),
    )
    .catch(() => undefined);
}
