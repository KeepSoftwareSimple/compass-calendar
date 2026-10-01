import { useEffect } from "react";
import { dispatchDesktopMenuShortcut } from "@web/desktop/dispatchDesktopMenuShortcut";
import { isDesktop } from "@web/desktop/isDesktop";

const DISPATCH_EVENT = "compass:dispatch-shortcut";

/**
 * Handles native menu `dispatchShortcut` calls injected by the macOS shell.
 */
export function useDesktopMenuShortcutBridge(): void {
  useEffect(() => {
    if (!isDesktop()) {
      return;
    }

    const onCustomEvent = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (typeof name === "string") {
        dispatchDesktopMenuShortcut(name);
      }
    };

    window.addEventListener(DISPATCH_EVENT, onCustomEvent);
    return () => {
      window.removeEventListener(DISPATCH_EVENT, onCustomEvent);
    };
  }, []);
}

export { DISPATCH_EVENT };
