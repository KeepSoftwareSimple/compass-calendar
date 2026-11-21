import { cardContextMenuPoint } from "@web/components/ContextMenu/contextMenu.anchor";
import { markKeyboardContextMenuDispatch } from "@web/shortcuts/context-menu/context-menu-pointer-hint";

/** Keyboard-open the event context menu anchored to a grid card element. */
export const dispatchGridEventContextMenuFromElement = (
  element: HTMLElement,
): void => {
  const { clientX, clientY } = cardContextMenuPoint(
    element.getBoundingClientRect(),
  );
  markKeyboardContextMenuDispatch();
  element.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    }),
  );
};
