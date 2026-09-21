import { useMemo } from "react";
import type dayjs from "@core/util/date/dayjs";
import { dayEventsQueryOptions } from "@web/events/queries/event.query.options";
import { useDayEventsQuery } from "@web/events/queries/useDayEventsQuery";
import { usePrefetchAdjacentEvents } from "@web/events/queries/usePrefetchAdjacentEvents";
import { dayEventQueryRange } from "@web/views/Day/util/day-window.util";

export function useDayEvents(dateInView: dayjs.Dayjs) {
  const { startDate, endDate } = useMemo(
    () => dayEventQueryRange(dateInView),
    [dateInView],
  );
  const query = useDayEventsQuery({ startDate, endDate });

  // Warm the previous/next day so the next prev/next click resolves from
  // cache. Uses the same start/end-of-day formatting as the read above,
  // so the prefetched entries land under the exact keys a subsequent read
  // looks up. Wait until the current day settles so first paint wins.
  const previous = useMemo(
    () => ({
      ...dayEventQueryRange(dateInView.subtract(1, "day")),
      calendarIds: query.calendarIds,
    }),
    [dateInView, query.calendarIds],
  );
  const next = useMemo(
    () => ({
      ...dayEventQueryRange(dateInView.add(1, "day")),
      calendarIds: query.calendarIds,
    }),
    [dateInView, query.calendarIds],
  );
  usePrefetchAdjacentEvents(
    dayEventsQueryOptions,
    previous,
    next,
    query.isSuccess,
  );
}
