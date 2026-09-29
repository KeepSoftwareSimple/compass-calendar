import { track } from "@web/auth/posthog/track";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  pointerHintActions,
  selectPointerHintVisible,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { viewFromPathname } from "@web/shortcuts/tips/shortcut-telemetry";

let contextMenuPointerHintShownThisSession = false;
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
  contextMenuPointerHintShownThisSession = false;
  skipPointerHintForNextContextMenu = false;
};

/** Teach `m` once per session when the menu opens from a pointer right-click. */
export function maybePulseContextMenuOpenedByPointer(
  pathname = globalThis.location?.pathname ?? "/",
): void {
  if (consumeKeyboardContextMenuSkip()) return;
  if (contextMenuPointerHintShownThisSession) return;
  if (readPointerHintDismissedPermanently()) return;
  if (selectPointerHintVisible(usePointerHintStore.getState())) return;

  const editMenuUsage = readShortcutUsageProfile().shortcuts["edit-menu"];
  if (editMenuUsage && editMenuUsage.invocations > 0) return;

  contextMenuPointerHintShownThisSession = true;
  pointerHintActions.pulse({
    shortcutKey: [...APP_SHORTCUT_BINDINGS.editMenu.keycaps],
    source: "pointer",
  });
  track("pointer_hint_shown", {
    intent: "context-menu-open",
    shortcut_id: "edit-menu",
    source: "pointer",
    view: viewFromPathname(pathname),
  });
}
