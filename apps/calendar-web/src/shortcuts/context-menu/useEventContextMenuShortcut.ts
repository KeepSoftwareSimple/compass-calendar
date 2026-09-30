import { getFocusedCalendarEvent } from "@web/common/utils/event/event.util";
import { cardContextMenuPoint } from "@web/components/ContextMenu/contextMenu.floating";
import { markKeyboardContextMenuDispatch } from "@web/shortcuts/context-menu/context-menu-pointer-hint";
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

      const { clientX, clientY } = cardContextMenuPoint(
        focused.element.getBoundingClientRect(),
      );
      markKeyboardContextMenuDispatch();
      focused.element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
        }),
      );
      return true;
    },
    "edit-menu",
  );
}
