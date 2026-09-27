import { type Id } from "react-toastify";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

export const CONTEXT_MENU_KEYBOARD_ONLY_TOAST_ID: Id =
  "context-menu-keyboard-only";

/**
 * The right-click menu is a read-only reference for edit/duplicate/delete
 * (packet: context menu keyboard-only). Clicking one of those items never
 * performs the action; this names the keyboard shortcut to use instead.
 */
export function promptContextMenuKeyboardOnly(
  label: string,
  keys: string[],
): void {
  showStatusToast(
    CONTEXT_MENU_KEYBOARD_ONLY_TOAST_ID,
    <span className="inline-flex items-center gap-1.5">
      Keyboard only, press <ShortcutKeys keys={keys} /> to {label.toLowerCase()}
    </span>,
  );
}
