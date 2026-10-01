import { dispatchDesktopMenuShortcut } from "@web/desktop/dispatchDesktopMenuShortcut";
import { isDesktop } from "@web/desktop/isDesktop";

export const DISPATCH_EVENT = "compass:dispatch-shortcut";

let installed = false;

/**
 * Registers the native menu shortcut listener as early as possible. The macOS
 * shell can dispatch before React mounts RootShell.
 */
export function installDesktopMenuShortcutBridge(): void {
  if (installed || !isDesktop()) {
    return;
  }
  installed = true;

  window.addEventListener(DISPATCH_EVENT, (event: Event) => {
    const name = (event as CustomEvent<{ name?: string }>).detail?.name;
    if (typeof name === "string") {
      dispatchDesktopMenuShortcut(name);
    }
  });
}
