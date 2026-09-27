import { useEffect } from "react";
import {
  reopenCommandPaletteIfNeeded,
  type SettingsPage,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";

type SettingsHistoryState = {
  compassSettingsPage?: SettingsPage;
  compassSettingsDepth?: number;
} | null;

const currentEntry = () => window.history.state as SettingsHistoryState;

/**
 * Settings is store state, not a route, so the browser back button used to
 * skip straight past it. Mirror each Settings page into a same-URL history
 * entry so back steps Billing → Accounts → palette (or calendar), and unwind
 * those entries when Settings closes another way (Esc, Mod+,) so later back
 * presses are never dead.
 *
 * Push and unwind run in the store subscriber, not a render effect, so
 * StrictMode's double effect run cannot push or unwind twice.
 */
export function useSettingsBrowserBack() {
  useEffect(() => {
    let popping = false;

    const unsubscribe = useSettingsStore.subscribe((state, prev) => {
      if (popping) return;
      const depth = currentEntry()?.compassSettingsDepth ?? 0;
      const opened = state.isSettingsOpen && !prev.isSettingsOpen;
      const pageChanged =
        state.isSettingsOpen && state.settingsPage !== prev.settingsPage;

      if (opened || pageChanged) {
        window.history.pushState(
          {
            ...currentEntry(),
            compassSettingsPage: state.settingsPage,
            compassSettingsDepth: depth + 1,
          },
          "",
        );
      } else if (!state.isSettingsOpen && prev.isSettingsOpen && depth > 0) {
        window.history.go(-depth);
      }
    });

    const onPopState = () => {
      if (!useSettingsStore.getState().isSettingsOpen) return;
      const page = currentEntry()?.compassSettingsPage;
      popping = true;
      try {
        if (page) settingsActions.setSettingsPage(page);
        else reopenCommandPaletteIfNeeded(settingsActions.closeSettings);
      } finally {
        popping = false;
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
}
