import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import {
  isGridEventScheduleLocked,
  resolveCalendarCardIdentity,
  resolveCalendarFocusColor,
} from "@web/calendars/useCalendarLookup";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  type GridGuestResponseState,
  guestResponseForEvent,
} from "@web/events/attendee-rsvp";
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
  const calendar = event.calendarId ? lookup.get(event.calendarId) : undefined;

  return {
    calendarIdentity: resolveCalendarCardIdentity(lookup, event),
    focusColor: resolveCalendarFocusColor(lookup, event),
    guestResponse: guestResponseForEvent(event, calendar?.accountEmail),
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

export function gridEventCardOpacity({
  isHidden,
  isPlaceholder,
  guestResponse,
}: {
  isHidden: boolean;
  isPlaceholder: boolean;
  guestResponse?: GridGuestResponseState | null;
}): number | undefined {
  if (isHidden) return 0.6;
  if (isPlaceholder) return 0.5;
  if (guestResponse === "awaiting") return 0.7;
  if (guestResponse === "declined") return 0.5;
  return undefined;
}

export function guestResponseAccessiblePrefix(
  guestResponse?: GridGuestResponseState | null,
): string {
  switch (guestResponse) {
    case "awaiting":
      return "Awaiting reply: ";
    case "tentative":
      return "Tentative: ";
    case "declined":
      return "Declined: ";
    default:
      return "";
  }
}
