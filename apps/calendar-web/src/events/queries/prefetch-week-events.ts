import { type QueryClient } from "@tanstack/react-query";
import dayjs from "@core/util/date/dayjs";
import { queryClient as defaultQueryClient } from "@web/api/query-client";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  prefetchRangeEvents,
  weekEventsViewQueryOptions,
} from "@web/events/queries/event.query.options";
import { getEventRepositorySource } from "@web/events/repositories/event.repository.util";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { weekEventsQueryWindow } from "@web/views/Week/util/week-window.util";

export function weekDateStringFromPathname(
  pathname: string,
): string | undefined {
  const prefix = `${ROOT_ROUTES.WEEK}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const dateString = pathname.slice(prefix.length);
  return dateString.length > 0 ? dateString : undefined;
}

function weekAnchorForPrefetch(dateString: string | undefined) {
  const timeZone = getEffectiveTimeZone();
  if (dateString) {
    return dayjs.tz(dateString, timeZone);
  }
  return dayjs().tz(timeZone).startOf("week");
}

/**
 * Start the week-events query before the lazy WeekView chunk resolves.
 * Failures are swallowed: the view hook surfaces them contextually.
 */
export function prefetchWeekEventsQuery({
  dateString,
  authenticated,
  client = defaultQueryClient,
}: {
  dateString?: string;
  authenticated: boolean;
  client?: QueryClient;
}): void {
  const { startOfView, endOfView } = weekEventsQueryWindow(
    weekAnchorForPrefetch(dateString),
  );
  const source = getEventRepositorySource(authenticated);
  prefetchRangeEvents(client, source, authenticated, (calendarIds) =>
    weekEventsViewQueryOptions({
      startOfView,
      endOfView,
      source,
      calendarIds,
    }),
  );
}
