import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/** Chip keys and hotkey for the sidebar reload control and update toast. */
export const APP_UPDATE_RELOAD_SHORTCUT = ["Mod", "R"] as const;

export const APP_UPDATE_RELOAD_HOTKEY =
  `${APP_UPDATE_RELOAD_SHORTCUT[0]}+${APP_UPDATE_RELOAD_SHORTCUT[1]}` as const;

/** Reload the page when Mod+R is pressed while a reload affordance is visible. */
export function useReloadAppShortcut(enabled: boolean): void {
  useAppShortcut(APP_UPDATE_RELOAD_HOTKEY, reloadLocation, {
    enabled,
    ignoreInputs: true,
    preventDefault: true,
    stopPropagation: true,
  });
}
