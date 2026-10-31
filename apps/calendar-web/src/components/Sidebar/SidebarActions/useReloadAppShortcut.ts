import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/** The reload chord. Every surface that shows or binds it reads these keycaps. */
export const RELOAD_APP_KEYCAPS = ["Mod", "R"] as const;

const RELOAD_APP_HOTKEY =
  `${RELOAD_APP_KEYCAPS[0]}+${RELOAD_APP_KEYCAPS[1]}` as const;

/** Reload the page when Mod+R is pressed while a reload affordance is visible. */
export function useReloadAppShortcut(enabled: boolean): void {
  useAppShortcut(RELOAD_APP_HOTKEY, reloadLocation, {
    enabled,
    ignoreInputs: true,
    preventDefault: true,
    stopPropagation: true,
  });
}
