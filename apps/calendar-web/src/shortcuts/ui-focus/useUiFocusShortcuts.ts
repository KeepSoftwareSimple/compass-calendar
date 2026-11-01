import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import {
  moveCalendarUiFocusLeft,
  moveLifeUiFocusLeft,
  moveLifeUiFocusRight,
} from "@web/shortcuts/ui-focus/ui-focus-region.util";
import { useUiFocusLetterShortcut } from "@web/shortcuts/ui-focus/useUiFocusLetterShortcut";

/** Day and Week: registers `u` to move focus left (toward the grid). */
export function useCalendarUiFocusLeftShortcut(focusGridEvent: () => void) {
  useUiFocusLetterShortcut(
    APP_SHORTCUT_BINDINGS.focusEvent.hotkey,
    () => {
      moveCalendarUiFocusLeft(focusGridEvent);
    },
    { shortcutId: "focus-event" },
  );
}

/** Life: `u` returns to the grid; `i` focuses the first sidebar field. */
export function useLifeUiFocusShortcuts() {
  useUiFocusLetterShortcut(
    APP_SHORTCUT_BINDINGS.focusEvent.hotkey,
    () => {
      moveLifeUiFocusLeft();
    },
    { shortcutId: "focus-event" },
  );

  useUiFocusLetterShortcut(
    APP_SHORTCUT_BINDINGS.focusSidebar.hotkey,
    () => {
      moveLifeUiFocusRight();
    },
    { shortcutId: "focus-sidebar" },
  );
}
