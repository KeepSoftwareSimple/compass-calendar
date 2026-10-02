import { useEffect } from "react";
import { showDesktopUpdateReadyToast } from "@web/common/utils/toast/desktop-update-ready.toast";
import { isDesktop } from "@web/desktop/isDesktop";

/**
 * The macOS shell delivers `onUpdateReady` once Sparkle has staged an update.
 * Offer a restart; ignoring the toast is fine because the update also
 * installs on quit.
 */
export function useDesktopUpdateReady(): void {
  useEffect(() => {
    if (!isDesktop()) return;
    const bridge = window.compassDesktop;
    if (!bridge) return;
    return bridge.onUpdateReady(() => {
      showDesktopUpdateReadyToast(() => bridge.restartToUpdate());
    });
  }, []);
}
