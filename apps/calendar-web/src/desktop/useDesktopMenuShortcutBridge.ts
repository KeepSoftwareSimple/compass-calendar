import { useEffect } from "react";
import { installDesktopMenuShortcutBridge } from "@web/desktop/installDesktopMenuShortcutBridge";

/**
 * Ensures the native menu shortcut listener is registered (also installed from
 * app bootstrap before the first paint).
 */
export function useDesktopMenuShortcutBridge(): void {
  useEffect(() => {
    installDesktopMenuShortcutBridge();
  }, []);
}
