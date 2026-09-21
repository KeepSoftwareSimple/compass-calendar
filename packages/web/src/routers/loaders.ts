import { redirect } from "@tanstack/react-router";
import { zYearMonthDayString } from "@core/types/type.utils";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  DEFAULT_CALENDAR_ROUTE,
  ROOT_ROUTES,
} from "@web/common/constants/routes";
import { prefetchDayEventsQuery } from "@web/events/queries/prefetch-day-events";
import {
  prefetchWeekEventsQuery,
  weekDateStringFromPathname,
} from "@web/events/queries/prefetch-week-events";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

export interface DayLoaderData {
  // Midnight in the effective timezone: dayEventQueryRange formats this to
  // build the day's query bounds, so a UTC-mode parse of a date-only string
  // would shift the window and drop evening events.
  dateInView: Dayjs;
  dateString: string;
}

export async function loadAuthenticated() {
  // Playwright e2e serves the web app without a backend; SuperTokens session
  // checks can block navigation until the HTTP client times out. The e2e
  // webpack build uses NODE_ENV=test (see playwright.config.ts webServer env).
  if (process.env.NODE_ENV === "test") {
    return { authenticated: false };
  }

  const { session } = await import("../auth/compass/session/Session");

  const authenticated = await session.doesSessionExist();

  return { authenticated };
}

export function loadTodayData(): DayLoaderData {
  const dateInView = dayjs().tz(getEffectiveTimeZone());
  const dateFormat = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

  return { dateInView, dateString: dateInView.format(dateFormat) };
}

export function redirectToToday(
  to: typeof ROOT_ROUTES.DAY_DATE | typeof ROOT_ROUTES.WEEK_DATE,
): never {
  const { dateString } = loadTodayData();

  throw redirect({
    to,
    params: { dateString },
    search: (prev: Record<string, unknown>) => prev,
  });
}

export function redirectToDefaultCalendar(): never {
  throw redirect({
    to: DEFAULT_CALENDAR_ROUTE,
    search: (prev: Record<string, unknown>) => prev,
  });
}

// Deliberately not params.parse: a throwing parser makes the route not
// match (-> NotFound), but the existing UX redirects an invalid dateString
// to the base route instead. Runs in beforeLoad so an invalid param never
// reaches the loader.
function validateDateStringParam(
  dateString: string | undefined,
  baseRoute: typeof ROOT_ROUTES.DAY | typeof ROOT_ROUTES.WEEK,
): void {
  if (!zYearMonthDayString.safeParse(dateString).success) {
    throw redirect({ to: baseRoute });
  }
}

export function validateDayDateParam({
  params,
}: {
  params: { dateString: string };
}): void {
  validateDateStringParam(params.dateString, ROOT_ROUTES.DAY);
}

export function validateWeekDateParam({
  params,
}: {
  params: { dateString: string };
}): void {
  validateDateStringParam(params.dateString, ROOT_ROUTES.WEEK);
}

// Shared by dayDateRoute and weekDateRoute: once beforeLoad has validated
// the param, shaping it into DayLoaderData doesn't depend on which route
// matched.
export function loadDateParam({
  params,
}: {
  params: { dateString: string };
}): DayLoaderData {
  return {
    dateString: params.dateString,
    dateInView: dayjs.tz(params.dateString, getEffectiveTimeZone()),
  };
}

type DayEventsLoaderArgs = {
  params: { dateString: string };
  context: { authenticated?: boolean };
};

export function loadDayEvents({ params, context }: DayEventsLoaderArgs): void {
  prefetchDayEventsQuery({
    dateString: params.dateString,
    authenticated: context.authenticated === true,
  });
}

// Starts the day-events prefetch alongside the lazy DayViewContent chunk
// load (see dayDateRoute), instead of after it mounts.
export function loadDayDate(opts: DayEventsLoaderArgs): DayLoaderData {
  loadDayEvents(opts);
  return loadDateParam(opts);
}

type WeekEventsLoaderArgs = {
  params: { dateString?: string };
  location: { pathname: string };
  context: { authenticated?: boolean };
};

export function loadWeekEvents({
  params,
  location,
  context,
}: WeekEventsLoaderArgs): void {
  prefetchWeekEventsQuery({
    dateString:
      params.dateString ?? weekDateStringFromPathname(location.pathname),
    authenticated: context.authenticated === true,
  });
}

export function loadWeekDate(
  opts: WeekEventsLoaderArgs & { params: { dateString: string } },
): DayLoaderData {
  loadWeekEvents(opts);
  return loadDateParam(opts);
}
