import { pulseClickTaughtShortcut } from "@web/shortcuts/pointer-intent/pulseClickTaughtShortcut";

let skipPointerHintForNextContextMenu = false;

/** Set before the `m` shortcut dispatches a synthetic contextmenu. */
export const markKeyboardContextMenuDispatch = (): void => {
  skipPointerHintForNextContextMenu = true;
};

const consumeKeyboardContextMenuSkip = (): boolean => {
  if (!skipPointerHintForNextContextMenu) return false;
  skipPointerHintForNextContextMenu = false;
  return true;
};

export const resetContextMenuPointerHintForTests = (): void => {
  skipPointerHintForNextContextMenu = false;
};

/** Teach `m` once per session when the menu opens from a pointer right-click. */
export function maybePulseContextMenuOpenedByPointer(
  pathname = globalThis.location?.pathname ?? "/",
): void {
  if (consumeKeyboardContextMenuSkip()) return;
  pulseClickTaughtShortcut("edit-menu", {
    pathname,
    intent: "context-menu-open",
  });
}
