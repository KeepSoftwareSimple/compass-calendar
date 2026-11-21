import { EVENT_MENU_LETTER } from "@core/shortcuts/binding-keycaps.constants";
import { getFocusedCalendarEvent } from "@web/common/utils/event/event.util";
import { dispatchGridEventContextMenuFromElement } from "@web/shortcuts/context-menu/dispatch-grid-event-context-menu";
import { useBareLetterShortcut } from "@web/shortcuts/useBareLetterShortcut";

export { EVENT_MENU_LETTER };

/**
 * Bare {@link EVENT_MENU_LETTER} opens the focused event's context menu: it
 * dispatches a synthetic contextmenu event at the card, which
 * ContextMenuWrapper already handles and positions from the event coordinates.
 * The menu itself is fully keyboard-operable (floating-ui list navigation).
 *
 * Stands down with the other bare letters: app-locked, typing, an `e`…
 * sequence armed, or event jump owning letters.
 */
export function useEventContextMenuShortcut() {
  useBareLetterShortcut(
    EVENT_MENU_LETTER,
    () => {
      const focused = getFocusedCalendarEvent();
      if (!focused) return false;

      dispatchGridEventContextMenuFromElement(focused.element);
      return true;
    },
    "edit-menu",
  );
}
