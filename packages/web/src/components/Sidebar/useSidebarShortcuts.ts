import {
  selectIsShortcutsOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { isAppLocked, useAppLockReason } from "@web/shortcuts/app-lock";
import { useAppShortcutUp } from "@web/shortcuts/useAppShortcut";

const TOGGLE_SHORTCUTS_HOTKEY = { key: "?", shift: true } as const;
const TOGGLE_SHORTCUTS_SLASH_HOTKEY = { key: "/", shift: true } as const;

/** Mount once per view: registers the `?`/`/` hotkeys and holds the app-lock
 * while the overlay is open. State itself lives in view.store, next to
 * sidebar.isOpen, since opening/closing either one affects the other.
 *
 * Opening respects the app-lock so a takeover (shortcut showcase) is not
 * interrupted. Closing still works while this overlay itself holds the lock. */
export function useSidebarShortcuts() {
  const isShortcutsOpen = useViewStore(selectIsShortcutsOpen);
  useAppLockReason("shortcutsOverlay", isShortcutsOpen);

  const toggleIfUnlocked = () => {
    if (isAppLocked() && !selectIsShortcutsOpen(useViewStore.getState())) {
      return;
    }
    viewActions.toggleShortcuts();
  };

  useAppShortcutUp(TOGGLE_SHORTCUTS_HOTKEY, toggleIfUnlocked, {
    ignoreAppLock: true,
    shortcutId: "other-shortcuts",
  });
  useAppShortcutUp(TOGGLE_SHORTCUTS_SLASH_HOTKEY, toggleIfUnlocked, {
    ignoreAppLock: true,
    shortcutId: "other-shortcuts",
  });
}
