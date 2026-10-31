import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { moveCalendarUiFocusRight } from "@web/shortcuts/ui-focus/ui-focus-region.util";
import { useAppShortcutUp } from "@web/shortcuts/useAppShortcut";

/** Mount once per calendar view: `i` moves focus one region right (sidebar). */
export function useFocusSidebarShortcut() {
  useAppShortcutUp(
    APP_SHORTCUT_BINDINGS.focusSidebar.hotkey,
    () => {
      moveCalendarUiFocusRight();
    },
    { shortcutId: "focus-sidebar" },
  );
}
