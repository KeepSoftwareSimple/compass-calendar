import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";

/**
 * Calendar ids worth sending on event list reads: every active calendar.
 * Visibility is applied in the view model, so hiding a calendar does not
 * re-key or refetch the window. When calendars have not loaded yet, returns
 * undefined so the remote events query stays disabled until real ids exist.
 */
export function deriveEventListCalendarIds(
  calendars: Calendar[] | undefined,
): CalendarId[] | undefined {
  if (calendars === undefined) return undefined;

  return calendars
    .filter((calendar) => calendar.isActive)
    .map((calendar) => calendar.id);
}
