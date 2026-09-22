import { type Calendar } from "@core/types/calendar.contracts";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { useDefaultTargetCalendar } from "@web/calendars/useDefaultTargetCalendar";
import { type NormalizedEventQueryData } from "./event.query.types";
import {
  type CalendarEventViewModel,
  deriveCalendarEventViewModel,
} from "./event.view-model";
import { filterEventsByVisibleCalendars } from "./filter-events-by-visible-calendars";
import { mergeDuplicateCopies } from "./merge-duplicate-copies";

// Stable stand-in for calendars that haven't loaded, so the empty default
// doesn't churn the memo below (or useDefaultTargetCalendar) once per render.
const NO_CALENDARS: Calendar[] = [];

// One memo for the whole pipeline, keyed on the references the three stages
// read: the query data, the calendars, and the default account's email. The
// Week view model is consumed by many components, and every one of them
// derives that same triple from the same stores, so a single remembered entry
// serves them all - without it each consumer would build its own filtered and
// merged copies and re-run the grid assembly. The email is a plain value
// rather than a third map level, since one remembered pair hits as often as a
// map would.
const pipelineCache = new WeakMap<
  NormalizedEventQueryData,
  WeakMap<
    Calendar[],
    { defaultAccountEmail: string; viewModel: CalendarEventViewModel }
  >
>();

/**
 * The shared query-data -> grid pipeline behind the Day and Week view models:
 * drop hidden calendars, merge cross-account duplicate meetings, then derive
 * the grid arrays. Order matters - the merge runs AFTER the visibility filter
 * so hiding one account's calendar unmerges on its own, and BEFORE the view
 * model so the grid and the Up Next banner both see one event per meeting.
 */
export function useCalendarEventViewModel(
  data: NormalizedEventQueryData | undefined,
): CalendarEventViewModel {
  const { data: calendars } = useCalendarsQuery();
  const defaultAccountEmail =
    useDefaultTargetCalendar(calendars ?? NO_CALENDARS)?.accountEmail ?? "";

  if (!data) return deriveCalendarEventViewModel(undefined);

  let byCalendars = pipelineCache.get(data);
  if (!byCalendars) {
    byCalendars = new WeakMap();
    pipelineCache.set(data, byCalendars);
  }
  // Calendars still loading is its own cache slot: the stages pass the data
  // through untouched then, which must not be confused with "no calendars are
  // visible".
  const cacheKey = calendars ?? NO_CALENDARS;
  const cached = byCalendars.get(cacheKey);
  if (cached?.defaultAccountEmail === defaultAccountEmail) {
    return cached.viewModel;
  }

  const viewModel = deriveCalendarEventViewModel(
    mergeDuplicateCopies(
      filterEventsByVisibleCalendars(data, calendars),
      calendars,
      defaultAccountEmail,
    ),
  );
  byCalendars.set(cacheKey, { defaultAccountEmail, viewModel });
  return viewModel;
}
