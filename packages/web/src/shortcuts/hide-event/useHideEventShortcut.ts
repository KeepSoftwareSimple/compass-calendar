import { getFocusedCalendarEvent } from "@web/common/utils/event/event.util";
import { useToggleEventHidden } from "@web/events/hidden/hidden-events.query";
import { HIDE_EVENT_LETTER } from "@web/shortcuts/hide-event/hide-event.constants";
import { useBareLetterShortcut } from "@web/shortcuts/useBareLetterShortcut";

/**
 * Bare `x` toggles the focused event's hidden state. Stands down with the
 * other bare letters: app-locked, typing, an `e`… sequence armed, or event
 * jump owning letters.
 */
export function useHideEventShortcut() {
  const toggleEventHidden = useToggleEventHidden();

  useBareLetterShortcut(HIDE_EVENT_LETTER, () => {
    const focused = getFocusedCalendarEvent();
    if (!focused) return false;
    toggleEventHidden(focused.eventId);
    return true;
  });
}
