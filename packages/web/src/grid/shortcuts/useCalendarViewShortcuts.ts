import { useDraftStore } from "@web/events/stores/draft.store";
import { useEdgeFocusStore } from "@web/grid/shortcuts/edge-focus.store";
import { useGridScrollShortcuts } from "@web/grid/shortcuts/useGridScrollShortcuts";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";
import { KEYMAP } from "@web/shortcuts/keymap";
import { isEventJumpActive } from "@web/shortcuts/shift-hint/event-jump.store";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import {
  useAppShortcut,
  useAppShortcutUp,
  WRITE_CREATE_SHORTCUT,
} from "@web/shortcuts/useAppShortcut";
import {
  setTimeTravelZone,
  useTimeTravelZone,
} from "@web/timezone/time-travel.store";
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
 * "c" creates a timed event, Shift+C creates an all-day event, and "u"
 * focuses the calendar;
 * PageUp/PageDown and Alt+ArrowUp/Down scroll the timed grid via
 * `useGridScrollShortcuts`.
 * Shift+J/K register only when the view provides a handler (Week's window
 * shift). "i" (focus sidebar) is registered separately via
 * useFocusSidebarShortcut. Behavior lives in each view's owner; this is only
 * the thin key-registration boundary.
 */
export function useCalendarViewShortcuts(config: CalendarViewShortcutsConfig) {
  const timeTravelZone = useTimeTravelZone();
  useGridScrollShortcuts();

  const nav = APP_SHORTCUT_BINDINGS;
  useAppShortcutUp(nav.navPrevious.hotkey, () => config.onPrevPeriod?.(), {
    shortcutId: "nav-previous",
  });
  useAppShortcutUp(nav.navNext.hotkey, () => config.onNextPeriod?.(), {
    shortcutId: "nav-next",
  });
  useAppShortcutUp(
    nav.navShiftLeft.hotkey,
    () => config.onShiftViewBackward?.(),
    {
      enabled: config.onShiftViewBackward !== undefined,
      shortcutId: "nav-shift-left",
    },
  );
  useAppShortcutUp(
    nav.navShiftRight.hotkey,
    () => config.onShiftViewForward?.(),
    {
      enabled: config.onShiftViewForward !== undefined,
      shortcutId: "nav-shift-right",
    },
  );
  useAppShortcutUp(nav.navToday.hotkey, () => config.onGoToToday?.(), {
    shortcutId: "nav-today",
  });
  useAppShortcutUp(
    nav.createAllDay.hotkey,
    () => config.onCreateAllDayEvent?.(),
    {
      ...WRITE_CREATE_SHORTCUT,
      shortcutId: "create-allday",
    },
  );
  useAppShortcutUp(
    KEYMAP.createEvent.hotkey,
    () => {
      if (!config.onCreateTimedEvent) return;
      config.onCreateTimedEvent();
      shortcutHintProgressActions.demonstrate("create-event");
    },
    {
      ...WRITE_CREATE_SHORTCUT,
      telemetryHintId: "create-event",
      shortcutId: "create-timed",
    },
  );
  useAppShortcutUp(nav.focusEvent.hotkey, () => config.onFocusCalendar?.(), {
    shortcutId: "focus-event",
  });
  // Keydown so a macOS Cmd+Z keyup-replay (meta already released) cannot
  // match this binding the way Mod+D vs D does on keyup.
  useAppShortcut(
    nav.otherTimeTravel.hotkey,
    () => timezoneDialogActions.open("time-travel"),
    { shortcutId: "other-time-travel" },
  );
  useAppShortcut(
    nav.createPlaceDiscard.hotkey,
    () => {
      if (isHigherEscapeOwner()) return;
      if (useEdgeFocusStore.getState().eventId) return;
      if (isEventJumpActive()) return;
      const { gridDraft, status } = useDraftStore.getState();
      if (
        status?.activity === "keyboardPlace" &&
        !status.isFormOpen &&
        gridDraft
      ) {
        return;
      }
      setTimeTravelZone(null);
    },
    { enabled: timeTravelZone !== null, shortcutId: "create-place-discard" },
  );
}
