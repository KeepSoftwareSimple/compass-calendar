import { getFocusedCalendarEvent } from "@web/common/utils/event/event.util";
import { useBareLetterShortcut } from "@web/shortcuts/useBareLetterShortcut";

export const EVENT_MENU_LETTER = "m";

/**
 * Bare `m` opens the focused event's context menu: it dispatches a synthetic
 * contextmenu event at the card, which ContextMenuWrapper already handles and
 * positions from the event coordinates. The menu itself is fully
 * keyboard-operable (floating-ui list navigation).
 *
 * Stands down with the other bare letters: app-locked, typing, an `e`…
 * sequence armed, or event jump owning letters (`m` is the Monday jump key).
 */
export function useEventContextMenuShortcut() {
  useBareLetterShortcut(
    EVENT_MENU_LETTER,
    () => {
      const focused = getFocusedCalendarEvent();
      if (!focused) return false;

      // Anchor near the card's top center so the menu reads as attached to
      // the event, like a right-click there would.
      const rect = focused.element.getBoundingClientRect();
      focused.element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + Math.min(rect.height / 2, 24),
        }),
      );
      return true;
    },
    "edit-menu",
  );
}
