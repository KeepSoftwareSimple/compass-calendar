import { useGridScrollShortcuts } from "@web/grid/shortcuts/useGridScrollShortcuts";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  useAppShortcut,
  useAppShortcutUp,
} from "@web/shortcuts/useAppShortcut";
import { timezoneDialogActions } from "@web/timezone/timezone-dialog.store";

export interface CalendarViewShortcutsConfig {
  /** J / K: previous / next period (day or week). */
  onPrevPeriod?: () => void;
  onNextPeriod?: () => void;
  /** Shift+J / Shift+K: shift the visible window by a day (Week only). */
  onShiftViewBackward?: () => void;
  onShiftViewForward?: () => void;
  onGoToToday?: () => void;
  onCreateAllDayEvent?: () => void;
  onCreateTimedEvent?: () => void;
  onFocusCalendar?: () => void;
}

/**
 * Shared Day/Week view shortcuts: j/k navigate the period, t goes to today,
 * "c" creates a timed event, "a" an all-day event, "u" focuses the calendar;
 * PageUp/PageDown scroll the timed grid via `useGridScrollShortcuts`.
 * Shift+J/K register only when the view provides a handler (Week's window
 * shift). "i" (focus sidebar) is registered separately via
 * useFocusSidebarShortcut. Behavior lives in each view's owner; this is only
 * the thin key-registration boundary.
 */
export function useCalendarViewShortcuts(config: CalendarViewShortcutsConfig) {
  useGridScrollShortcuts();

  useAppShortcutUp("J", () => config.onPrevPeriod?.());
  useAppShortcutUp("K", () => config.onNextPeriod?.());
  useAppShortcutUp("Shift+J", () => config.onShiftViewBackward?.(), {
    enabled: config.onShiftViewBackward !== undefined,
  });
  useAppShortcutUp("Shift+K", () => config.onShiftViewForward?.(), {
    enabled: config.onShiftViewForward !== undefined,
  });
  useAppShortcutUp("T", () => config.onGoToToday?.());
  useAppShortcutUp("A", () => config.onCreateAllDayEvent?.());
  useAppShortcutUp(KEYMAP.createEvent.hotkey, () =>
    config.onCreateTimedEvent?.(),
  );
  useAppShortcutUp("U", () => config.onFocusCalendar?.());
  // Keydown so a macOS Cmd+Z keyup-replay (meta already released) cannot
  // match this binding the way Mod+D vs D does on keyup.
  useAppShortcut("Z", () =>
    timezoneDialogActions.open(undefined, "time-travel"),
  );
}
