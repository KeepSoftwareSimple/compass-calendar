import { useEffect } from "react";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import { isDesktop } from "@web/desktop/isDesktop";
import { closeStream, openStream } from "@web/sse/client/sse.client";

/**
 * When the macOS shell wakes from sleep or regains network, it calls
 * `onResume`. Reconnect SSE and run the same refresh path as a long hidden tab.
 */
export function useDesktopResume(): void {
  const { isAvailable, refresh, state } = useConnectProvider("google");
  const canRefresh =
    isAvailable && (state === "HEALTHY" || state === "ATTENTION");

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }
    const bridge = window.compassDesktop;
    if (!bridge?.onResume) {
      return;
    }

    return bridge.onResume(() => {
      closeStream();
      openStream();
      void refreshUserMetadata({ force: true });
      if (canRefresh) {
        void refresh({ silent: true });
      }
    });
  }, [canRefresh, refresh]);
}
