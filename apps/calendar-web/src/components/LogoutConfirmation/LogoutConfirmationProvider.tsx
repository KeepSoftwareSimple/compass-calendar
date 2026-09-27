import { type PropsWithChildren, useCallback, useState } from "react";
import { useLogout } from "@web/auth/compass/hooks/useLogout";
import { clearAccountScopedQueryCache } from "@web/auth/compass/session/logout.teardown";
import { LOGGED_OUT_TOAST_ID } from "@web/common/constants/toast.constants";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import {
  LogoutConfirmationContext,
  useLogoutConfirmationState,
} from "@web/components/LogoutConfirmation/hooks/useLogoutConfirmation";
import { LogoutConfirmationDialog } from "@web/components/LogoutConfirmation/LogoutConfirmationDialog";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { settingsActions } from "@web/settings/settings.store";
import { useAppLockReason } from "@web/shortcuts/app-lock";

const LOGGING_OUT_MIN_MS = 400;

export function LogoutConfirmationProvider({ children }: PropsWithChildren) {
  const logout = useLogout();
  const value = useLogoutConfirmationState();
  const { closeLogoutConfirmation, isOpen } = value;
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useAppLockReason("loggingOut", isLoggingOut);

  const handleConfirm = useCallback(() => {
    closeLogoutConfirmation();
    settingsActions.closeSettings();
    settingsActions.closeCmdPalette();
    setIsLoggingOut(true);
    const shownAt = performance.now();

    void (async () => {
      const { signedOutRemotely } = await logout();
      const remaining = LOGGING_OUT_MIN_MS - (performance.now() - shownAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      clearAccountScopedQueryCache();
      setIsLoggingOut(false);
      if (signedOutRemotely) {
        showStatusToast(LOGGED_OUT_TOAST_ID, "You're logged out");
      } else {
        showErrorToast(
          "Logged out on this device. We couldn't reach the server to end the session everywhere.",
        );
      }
    })();
  }, [closeLogoutConfirmation, logout]);

  return (
    <LogoutConfirmationContext.Provider value={value}>
      {children}
      <LogoutConfirmationDialog
        isOpen={isOpen}
        onCancel={closeLogoutConfirmation}
        onConfirm={handleConfirm}
      />
      {isLoggingOut && (
        <OverlayPanel
          role="status"
          variant="status"
          message="Logging you out…"
        />
      )}
    </LogoutConfirmationContext.Provider>
  );
}
