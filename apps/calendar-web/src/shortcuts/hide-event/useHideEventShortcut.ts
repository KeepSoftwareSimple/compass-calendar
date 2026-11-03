import { HIDE_EVENT_LETTER } from "@core/shortcuts/binding-keycaps.constants";
import { getFocusedCalendarEvent } from "@web/common/utils/event/event.util";
import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";
import { useToggleEventHidden } from "@web/events/hidden/hidden-events.query";
import { isAppLocked } from "@web/shortcuts/app-lock";
import { useBareLetterShortcut } from "@web/shortcuts/useBareLetterShortcut";
import { isEditSequenceArmed } from "@web/shortcuts/useEditSequenceShortcut";

/**
 * Bare `x` toggles the focused event's hidden state. Stands down with the
 * other bare letters: app-locked, typing, an `e`… sequence armed, or event
 * jump owning letters.
 */
const shouldStandDownHideShortcut = (event: KeyboardEvent) =>
  isAppLocked() || isEditableKeyboardTarget(event) || isEditSequenceArmed();

export function useHideEventShortcut() {
  const toggleEventHidden = useToggleEventHidden().toggleEventHidden;

  useBareLetterShortcut(
    HIDE_EVENT_LETTER,
    (keyboardEvent) => {
      const focused = getFocusedCalendarEvent(keyboardEvent);
      if (!focused) return false;
      toggleEventHidden(focused.eventId);
      return true;
    },
    "edit-hide",
    shouldStandDownHideShortcut,
  );
}
