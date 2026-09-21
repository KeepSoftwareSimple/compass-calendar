import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";

/**
 * Calendar ids sent on event list reads: every active calendar, including
 * ones the user has hidden. Visibility is applied later by
 * filterEventsByVisibleCalendars, so toggling a calendar does not change
 * this list or the events query key.
 * When calendars have not loaded yet, returns undefined so the backend keeps
 * the legacy "all calendars" read until the list is known.
 */
export function deriveEventListCalendarIds(
  calendars: Calendar[] | undefined,
): CalendarId[] | undefined {
  if (calendars === undefined) return undefined;

  return calendars
    .filter((calendar) => calendar.isActive)
    .map((calendar) => calendar.id);
}
