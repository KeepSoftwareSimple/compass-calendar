import { type RegisterableHotkey } from "@tanstack/react-hotkeys";
import {
  type UseAppShortcutOptions,
  useAppShortcut,
  useAppShortcutUp,
} from "@web/shortcuts/useAppShortcut";

/**
 * Letter shortcuts that move focus into text fields: swallow keydown so the
 * browser (and Playwright) never deliver a keypress after focus moves, then
 * run the focus move on keyup.
 */
export function useUiFocusLetterShortcut(
  hotkey: RegisterableHotkey,
  handler: (event: KeyboardEvent) => void,
  options: Omit<UseAppShortcutOptions, "eventType" | "preventDefault"> = {},
) {
  useAppShortcut(hotkey, () => {}, {
    ...options,
    eventType: "keydown",
    preventDefault: true,
    shortcutId: undefined,
  });

  useAppShortcutUp(hotkey, handler, {
    ...options,
    // Handlers run on keyup; keydown swallow pairs with deferred field focus.
  });
}
