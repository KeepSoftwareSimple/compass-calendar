import { type RegisterableHotkey } from "@tanstack/react-hotkeys";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { isOverlayEscapeArmed } from "@web/components/OverlayPanel/overlay-escape";
import { useWelcomeGuideStore } from "@web/components/WelcomeModal/welcome.guide.store";
import { viewActions } from "@web/events/stores/view.store";
import {
  selectIsCmdPaletteOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  LIFE_SHORTCUT,
  VIEW_SHORTCUTS,
} from "@web/shortcuts/shortcuts.constants";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import {
  useAppShortcut,
  useAppShortcutUp,
} from "@web/shortcuts/useAppShortcut";

/**
 * Registers app-wide shortcuts via {@link useAppShortcut} / {@link useAppShortcutUp}.
 * Mount once under {@link HotkeysProvider} (see `GlobalShortcutsHost` in CompassProvider).
 */
export function useGlobalShortcuts() {
  useNavigationShortcuts();
  useCalendarShellShortcuts();
}

export function useNavigationShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const isCmdPaletteOpen = useSettingsStore(selectIsCmdPaletteOpen);
  const dayHotkey = VIEW_SHORTCUTS.day.key.toUpperCase() as RegisterableHotkey;
  const weekHotkey =
    VIEW_SHORTCUTS.week.key.toUpperCase() as RegisterableHotkey;
  const lifeHotkey = LIFE_SHORTCUT.key.toUpperCase() as RegisterableHotkey;

  // macOS swallows the keyup for a letter held with Cmd until Cmd itself is
  // released, then replays it with metaKey already false — which matches the
  // bare "D" view shortcut below and incorrectly navigates to Day view right
  // after a Cmd+D (duplicate event) press. Ignore the Day shortcut for a
  // short window after Mod+D fires to filter out that replayed keyup.
  const suppressDayShortcutUntilRef = useRef(0);

  useAppShortcut(
    "Mod+D",
    () => {
      suppressDayShortcutUntilRef.current = Date.now() + 1000;
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );

  useAppShortcutUp(
    dayHotkey,
    () => {
      if (Date.now() < suppressDayShortcutUntilRef.current) {
        suppressDayShortcutUntilRef.current = 0;
        return;
      }

      if (!location.pathname.startsWith(VIEW_SHORTCUTS.day.route)) {
        navigate({ to: VIEW_SHORTCUTS.day.route });
      }
    },
    { shortcutId: "nav-day-view" },
  );

  useAppShortcutUp(
    weekHotkey,
    () => {
      if (!location.pathname.startsWith(VIEW_SHORTCUTS.week.route)) {
        navigate({ to: VIEW_SHORTCUTS.week.route });
      }
    },
    { shortcutId: "nav-week-view" },
  );

  useAppShortcutUp(
    lifeHotkey,
    () => {
      if (!location.pathname.startsWith(LIFE_SHORTCUT.route)) {
        navigate({ to: LIFE_SHORTCUT.route });
      }
    },
    { shortcutId: "nav-life-view" },
  );

  useAppShortcut(
    KEYMAP.commandPalette.hotkey,
    () => {
      // Blur after this gate: first-visit welcome keys live on a focused
      // child, and stealing focus here would leave S / Escape with nowhere
      // to land.
      if (useWelcomeGuideStore.getState().isFirstVisitOpen) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      const wasOpen = useSettingsStore.getState().isCmdPaletteOpen;
      settingsActions.toggleCmdPalette();
      if (!wasOpen) {
        shortcutHintProgressActions.demonstrate("command-palette");
      }
    },
    {
      ignoreInputs: false,
      ignoreAppLock: true,
      shortcutId: "other-palette",
    },
  );

  // Armed only while the palette is open and no OverlayPanel owns Escape.
  // Overlay dismiss and this shortcut both fire on the same key otherwise,
  // which would close the overlay and the palette in one press.
  useAppShortcut(
    "Escape",
    () => {
      if (isOverlayEscapeArmed()) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      settingsActions.closeCmdPalette();
    },
    {
      enabled: isCmdPaletteOpen,
      ignoreInputs: false,
      ignoreAppLock: true,
    },
  );

  useAppShortcut(
    APP_SHORTCUT_BINDINGS.otherSettings.hotkey,
    () => {
      settingsActions.toggleSettings();
    },
    {
      ignoreInputs: false,
      blurOnTrigger: true,
      ignoreAppLock: true,
      shortcutId: "other-settings",
    },
  );
}

export function useCalendarShellShortcuts() {
  useAppShortcutUp(
    APP_SHORTCUT_BINDINGS.otherSidebar.hotkey,
    () => viewActions.toggleSidebar(),
    { shortcutId: "other-sidebar" },
  );
}
