import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/** Reload the page when Mod+R is pressed while a reload affordance is visible. */
export function useReloadAppShortcut(enabled: boolean): void {
  useAppShortcut("Mod+R", reloadLocation, {
    enabled,
    ignoreInputs: true,
    preventDefault: true,
    stopPropagation: true,
  });
}
