import { useLocation, useParams, useRouter } from "@tanstack/react-router";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { AuthApi } from "@web/api/auth.api";
import { AuthCallbackOverlay } from "@web/auth/callback/AuthCallbackOverlay";
import { DesktopOAuthCallbackRelay } from "@web/auth/callback/DesktopOAuthCallbackRelay";
import { shouldRelayDesktopOAuthCallback } from "@web/auth/callback/desktop-oauth-callback-relay";
import { reportAuthCallbackCrash } from "@web/auth/callback/report-auth-callback-crash";
import { resolveStaleProviderOAuthReplay } from "@web/auth/callback/resolve-stale-provider-oauth-replay";
import { stripOAuthCallbackQueryFromHistory } from "@web/auth/callback/strip-oauth-callback-url";
import { useOneShotAuthCallback } from "@web/auth/callback/useOneShotAuthCallback";
import { useRedirectStaleProviderOAuthReplay } from "@web/auth/callback/useRedirectStaleProviderOAuthReplay";
import { useCompleteAuthentication } from "@web/auth/compass/hooks/useCompleteAuthentication";
import { trackGoogleOAuthScopesRecoverySucceeded } from "@web/auth/posthog/google-oauth-scopes-recovery-funnel";
import { trackOAuthSignupFailed } from "@web/auth/posthog/oauth-signup-funnel";
import { scheduleSignupCompleted } from "@web/auth/posthog/signup-completed-coordinator";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { completeProviderAuthorization } from "@web/auth/providers/authorization/complete-provider-authorization";
import {
  isSignInProviderKind,
  PROVIDER_AUTHORIZATION_ERROR_MESSAGE,
} from "@web/auth/providers/authorization/provider-authorization.constants";
import { consumeGoogleOAuthScopesRecoveryPending } from "@web/auth/providers/authorization/provider-authorization.storage";
import { recordOAuthSignInCallbackLanding } from "@web/auth/providers/authorization/record-oauth-signin-callback-landing";
import { missingPermissionsActions } from "@web/auth/providers/missing-permissions.store";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { queuePendingShellToast } from "@web/common/utils/toast/pending-shell-toast";

type CompleteAuthentication = ReturnType<typeof useCompleteAuthentication>;

type CompleteProviderAuthCallbackOptions = {
  provider: ProviderKind;
  completeAuthentication: CompleteAuthentication;
  navigate: (path: string, opts: { replace: true }) => void;
  search: string;
};

export async function completeProviderAuthCallback({
  provider,
  completeAuthentication,
  navigate,
  search,
}: CompleteProviderAuthCallbackOptions): Promise<void> {
  stripOAuthCallbackQueryFromHistory((path) =>
    navigate(path, { replace: true }),
  );

  const staleReturnPath = await resolveStaleProviderOAuthReplay({
    provider,
    search,
    pathname:
      typeof window !== "undefined" ? window.location.pathname : undefined,
  });
  if (staleReturnPath) {
    navigate(staleReturnPath, { replace: true });
    return;
  }

  // Before any branch: a user who came back from the provider is counted even
  // when the exchange below fails.
  recordOAuthSignInCallbackLanding(provider, search);

  const result = await completeProviderAuthorization({
    provider,
    authApi: AuthApi,
    completeAuthentication,
    search,
  });

  if (result.status === "failed") {
    trackOAuthSignupFailed({
      provider,
      reason: result.reason,
      providerError:
        result.error === "access_denied" ? result.error : undefined,
      step: "oauth_callback_returned",
      error: result.error,
    });
    // Cancelling is a choice, not a fault. An error toast for it reads as a
    // Compass failure and discourages the retry that would have worked.
    if (result.reason === "oauth_user_cancelled") {
      queuePendingShellToast({ variant: "info", message: result.message });
    } else if (result.reason === "oauth_missing_scopes") {
      const missingScopes = result.missingScopes ?? [];
      if (
        provider === "google" &&
        result.signupFlow === true &&
        missingScopes.length > 0
      ) {
        missingPermissionsActions.openGoogleSignupRecovery(missingScopes);
      } else {
        // Unchecking a permission on the consent screen deserves an
        // explanation and a one-click retry, not a toast.
        missingPermissionsActions.open(provider);
      }
    } else {
      queuePendingShellToast({ variant: "error", message: result.message });
    }
  } else {
    if (consumeGoogleOAuthScopesRecoveryPending()) {
      trackGoogleOAuthScopesRecoverySucceeded();
    }
    if (result.isNewUser) {
      scheduleSignupCompleted(provider);
      track("calendar_connected", { source: `signup_${provider}` });
      trackSignupStep("calendar_connected", { method: provider });
    } else {
      track("login_completed", { method: provider });
    }
  }

  navigate(result.returnPath, { replace: true });
}

export function ProviderAuthCallbackView() {
  const { provider: providerParam } = useParams({ strict: false });
  const location = useLocation();
  const router = useRouter();
  const completeAuthentication = useCompleteAuthentication();
  const searchParams = new URLSearchParams(location.searchStr);
  const oauthState = searchParams.get("state");
  const shouldRelay =
    providerParam &&
    isSignInProviderKind(providerParam) &&
    shouldRelayDesktopOAuthCallback(oauthState, false);

  useRedirectStaleProviderOAuthReplay(
    providerParam && isSignInProviderKind(providerParam)
      ? providerParam
      : "google",
    Boolean(
      providerParam && isSignInProviderKind(providerParam) && !shouldRelay,
    ),
  );

  useOneShotAuthCallback(() => {
    if (shouldRelay) {
      return;
    }

    if (!providerParam || !isSignInProviderKind(providerParam)) {
      showErrorToast("We couldn't finish signing you in. Please try again.");
      router.history.replace(DEFAULT_CALENDAR_ROUTE);
      return;
    }

    // The storage reads inside swallow their own errors today, so this catch
    // is a backstop rather than a fix for a reproduced case, but the failure
    // mode it guards (see `useOneShotAuthCallback`) is unrecoverable.
    completeProviderAuthCallback({
      provider: providerParam,
      completeAuthentication,
      navigate: (path) => router.history.replace(path),
      search: location.searchStr,
    }).catch(
      reportAuthCallbackCrash({
        method: providerParam,
        errorMessage: PROVIDER_AUTHORIZATION_ERROR_MESSAGE,
        replace: (path) => router.history.replace(path),
      }),
    );
  });

  if (shouldRelay && providerParam && isSignInProviderKind(providerParam)) {
    return (
      <DesktopOAuthCallbackRelay
        provider={providerParam}
        search={location.searchStr}
      />
    );
  }

  return <AuthCallbackOverlay />;
}
