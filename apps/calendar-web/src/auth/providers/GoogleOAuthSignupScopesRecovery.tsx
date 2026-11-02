import { type FC, useEffect, useRef } from "react";
import {
  trackGoogleOAuthScopesRecoveryRetryClicked,
  trackGoogleOAuthScopesRecoveryViewed,
} from "@web/auth/posthog/google-oauth-scopes-recovery-funnel";
import { markGoogleOAuthScopesRecoveryPending } from "@web/auth/providers/authorization/provider-authorization.storage";
import { useStartProviderAuthorization } from "@web/auth/providers/authorization/useStartProviderAuthorization";
import {
  missingPermissionsActions,
  selectMissingPermissionsMissingScopes,
  selectMissingPermissionsSignupFlow,
  selectMissingPermissionsSurface,
  useMissingPermissionsStore,
} from "@web/auth/providers/missing-permissions.store";
import {
  GOOGLE_SIGNUP_SCOPES_RECOVERY_MESSAGE,
  GOOGLE_SIGNUP_SCOPES_RECOVERY_RETRY_LABEL,
  GOOGLE_SIGNUP_SCOPES_RECOVERY_TITLE,
  MISSING_PERMISSIONS_NOT_NOW_LABEL,
} from "@web/auth/providers/provider-copy.util";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { isPlainEnterKey } from "@web/shortcuts/keyboard-modifiers.util";

export const GoogleOAuthSignupScopesRecovery: FC = () => {
  const surface = useMissingPermissionsStore(selectMissingPermissionsSurface);
  const missingScopes = useMissingPermissionsStore(
    selectMissingPermissionsMissingScopes,
  );
  const signupFlow = useMissingPermissionsStore(
    selectMissingPermissionsSignupFlow,
  );
  const isOpen = surface === "google_signup_recovery";
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  useAppLockReason("googleOAuthSignupScopesRecovery", isOpen);

  const { startAuthorization } = useStartProviderAuthorization("google", {
    intent: "signIn",
    signupFlow,
    prompt: "consent",
    scopes: missingScopes,
    includeGrantedScopes: true,
  });

  useEffect(() => {
    if (!isOpen) return;
    trackGoogleOAuthScopesRecoveryViewed();
  }, [isOpen]);

  if (!isOpen || missingScopes.length === 0) return null;

  const handleRetry = () => {
    trackGoogleOAuthScopesRecoveryRetryClicked(missingScopes.length);
    markGoogleOAuthScopesRecoveryPending();
    missingPermissionsActions.close();
    startAuthorization();
  };

  return (
    <OverlayPanel
      align="start"
      initialFocusRef={retryButtonRef}
      message={GOOGLE_SIGNUP_SCOPES_RECOVERY_MESSAGE}
      onDismiss={missingPermissionsActions.close}
      onKeyDown={(event) => {
        if (
          isPlainEnterKey(event) &&
          event.target !== dismissButtonRef.current
        ) {
          event.preventDefault();
          event.stopPropagation();
          handleRetry();
        }
      }}
      title={GOOGLE_SIGNUP_SCOPES_RECOVERY_TITLE}
      variant="modal"
      widthClassName="w-120"
    >
      <OverlayPanelActions align="start">
        <OverlayPanelActionButton
          ref={dismissButtonRef}
          onClick={missingPermissionsActions.close}
          shortcut="Esc"
        >
          {MISSING_PERMISSIONS_NOT_NOW_LABEL}
        </OverlayPanelActionButton>
        <OverlayPanelActionButton
          ref={retryButtonRef}
          onClick={handleRetry}
          shortcut="Enter"
          variant="primary"
        >
          {GOOGLE_SIGNUP_SCOPES_RECOVERY_RETRY_LABEL}
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
};
