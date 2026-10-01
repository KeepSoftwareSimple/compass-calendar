import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import { type UseConnectGoogleResult } from "@web/auth/providers/connect.types";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { isDesktop } from "@web/desktop/isDesktop";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { closeStream, openStream } from "@web/sse/client/sse.client";

const useDefaultConnectProvider = () => useConnectProvider("google");

/**
 * When the macOS shell wakes from sleep or regains network, it delivers
 * `onResume`. Reconnect SSE and run the same reconciliation paths as after a
 * long hidden tab in `useSyncFocusRefresh`, without the visibility threshold.
 */
export function useDesktopResume(
  useConnectGoogleImpl: () => UseConnectGoogleResult = useDefaultConnectProvider,
): void {
  const queryClient = useQueryClient();
  const { isAvailable, refresh, state } = useConnectGoogleImpl();
  const canRefresh =
    isAvailable && (state === "HEALTHY" || state === "ATTENTION");
  const silentRefresh = useCallback(() => refresh({ silent: true }), [refresh]);

  const handleResume = useCallback(() => {
    closeStream();
    openStream();
    void queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all });
    void refreshUserMetadata({ force: true });
    if (canRefresh) silentRefresh();
  }, [canRefresh, queryClient, silentRefresh]);

  useEffect(() => {
    if (!isDesktop()) return;
    const bridge = window.compassDesktop;
    if (!bridge?.onResume) return;
    return bridge.onResume(handleResume);
  }, [handleResume]);
}
