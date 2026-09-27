import { useCallback, useEffect, useRef } from "react";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import { type UseConnectGoogleResult } from "@web/auth/providers/connect.types";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import { useVisibleAfterHidden } from "@web/common/hooks/useVisibleAfterHidden";

// A tab hidden for less than this is treated as a quick alt-tab, not a
// meaningful gap in attention — mirrors useVersionCheck's threshold.
const MIN_HIDDEN_DURATION_MS = 30_000;

/**
 * Triggers the same Google Calendar sync refresh as the sidebar's "Refresh
 * calendar" CTA (`useConnectProvider().refresh`), automatically: on mount and
 * whenever the tab regains focus after being hidden for 30+ seconds. Without
 * this, a user only sees a caught-up calendar if they remember to click
 * Refresh themselves. Passes `silent: true` — the user didn't ask for this
 * one, so a transient failure shouldn't surface an error toast the way a
 * manual click's would. The sync service still coalesces redundant enqueues
 * regardless. Every `useConnectProvider()` instance delegates to the same
 * browser-wide refresh coordinator, so a focus refresh and a manual click
 * share work and status instead of racing each other.
 *
 * Provider refresh no-ops while there's no established connection worth
 * refreshing (not yet connected, reconnect required, or still on the initial
 * import). Metadata always reconciles on mount and on visible-after-hidden —
 * including during IMPORTING, which is exactly when the UI used to get stuck.
 *
 * `useConnectGoogleImpl` is a test seam (default: Google connect) so tests can
 * pass a fake implementation instead of mock.module-ing a hook other files
 * also mock.
 */
const useDefaultConnectProvider = () => useConnectProvider("google");

export const useSyncFocusRefresh = (
  useConnectGoogleImpl: () => UseConnectGoogleResult = useDefaultConnectProvider,
) => {
  const { isAvailable, refresh, state } = useConnectGoogleImpl();
  const didReconcileMetadataOnMount = useRef(false);
  const didProviderRefreshOnMount = useRef(false);
  const canRefresh =
    isAvailable && (state === "HEALTHY" || state === "ATTENTION");
  const silentRefresh = useCallback(() => refresh({ silent: true }), [refresh]);
  const reconcileMetadata = useCallback(() => {
    void refreshUserMetadata({ force: true });
  }, []);

  useEffect(() => {
    if (didReconcileMetadataOnMount.current) return;
    didReconcileMetadataOnMount.current = true;
    reconcileMetadata();
  }, [reconcileMetadata]);

  useEffect(() => {
    if (!canRefresh || didProviderRefreshOnMount.current) return;
    // Metadata briefly changes the connection state while a refresh is
    // requested. A mount refresh must not run again when that state settles,
    // or every completion enqueues another pull forever.
    didProviderRefreshOnMount.current = true;
    silentRefresh();
  }, [canRefresh, silentRefresh]);

  const onVisibleAfterHidden = useCallback(() => {
    if (canRefresh) silentRefresh();
    reconcileMetadata();
  }, [canRefresh, silentRefresh, reconcileMetadata]);

  useVisibleAfterHidden(onVisibleAfterHidden, MIN_HIDDEN_DURATION_MS);
};
