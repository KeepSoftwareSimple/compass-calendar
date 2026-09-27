import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import {
  isGridEventScheduleLocked,
  resolveCalendarCardIdentity,
  resolveCalendarFocusColor,
} from "@web/calendars/useCalendarLookup";
import { type GridEvent } from "@web/common/types/web.event.types";
import { isEventIdHidden } from "@web/events/hidden/hidden-event-id";

type CalendarLookup = ReadonlyMap<CalendarId, Calendar>;

/**
 * Calendar chrome resolved once per card at the list, not inside each card,
 * so memoized event cards do not rebuild identity on every parent render.
 */
export function resolveGridEventCardChrome(
  lookup: CalendarLookup,
  event: GridEvent,
  hiddenEventIds: ReadonlySet<string>,
) {
  return {
    calendarIdentity: resolveCalendarCardIdentity(lookup, event),
    focusColor: resolveCalendarFocusColor(lookup, event),
    isHidden: isEventIdHidden(event._id, hiddenEventIds),
    isReadOnly: isGridEventScheduleLocked(lookup, event),
  };
}

/**
 * A live placeholder can carry a dragging or resizing calendarId from the
 * draft store. Saved cards keep the list-level identity above.
 */
export function resolvePlaceholderCardChrome(
  lookup: CalendarLookup,
  eventForDisplay: GridEvent,
  isPlaceholder: boolean,
  stable: {
    calendarIdentity: ReturnType<typeof resolveCalendarCardIdentity>;
    focusColor: ReturnType<typeof resolveCalendarFocusColor>;
  },
) {
  if (!isPlaceholder) return stable;
  return {
    calendarIdentity: resolveCalendarCardIdentity(lookup, eventForDisplay),
    focusColor: resolveCalendarFocusColor(lookup, eventForDisplay),
  };
}
