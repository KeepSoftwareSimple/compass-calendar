import { useLocation, useRouter } from "@tanstack/react-router";
import { AuthApi } from "@web/api/auth.api";
import { APPLE_AUTHORIZATION_ERROR_MESSAGE } from "@web/auth/apple/authorization/apple-authorization.constants";
import { buildAppleAuthCodePayload } from "@web/auth/apple/authorization/apple-authorization.util";
import { AuthCallbackOverlay } from "@web/auth/callback/AuthCallbackOverlay";
import { DesktopOAuthCallbackRelay } from "@web/auth/callback/DesktopOAuthCallbackRelay";
import { shouldRelayDesktopAppleOAuthCallback } from "@web/auth/callback/desktop-oauth-callback-relay";
import { reportAuthCallbackCrash } from "@web/auth/callback/report-auth-callback-crash";
import { useOneShotAuthCallback } from "@web/auth/callback/useOneShotAuthCallback";
import { useCompleteAuthentication } from "@web/auth/compass/hooks/useCompleteAuthentication";
import {
  trackSignupCompleted,
  trackSignupStep,
} from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import {
  clearProviderAuthorizationIntent,
  readProviderAuthorizationIntent,
} from "@web/auth/providers/authorization/provider-authorization.storage";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";

type CompleteAuthentication = ReturnType<typeof useCompleteAuthentication>;

type CompleteAppleAuthCallbackOptions = {
  completeAuthentication: CompleteAuthentication;
  navigate: (path: string, opts: { replace: true }) => void;
  search: string;
};

export async function completeAppleAuthCallback({
  completeAuthentication,
  navigate,
  search,
}: CompleteAppleAuthCallbackOptions): Promise<void> {
  trackSignupStep("oauth_callback_returned", { method: "apple" });

  const params = new URLSearchParams(search);

  // Every way this callback can fail ends the same way: one error toast, then
  // off the callback route, which renders nothing but a spinner.
  const failTo = (path: string) => {
    showErrorToast(APPLE_AUTHORIZATION_ERROR_MESSAGE);
    navigate(path, { replace: true });
  };

  const state = params.get("state");

  if (!state) {
    failTo(DEFAULT_CALENDAR_ROUTE);
    return;
  }

  const savedIntent = readProviderAuthorizationIntent("apple", state);
  clearProviderAuthorizationIntent("apple", state);
  const returnPath = savedIntent?.returnPath ?? DEFAULT_CALENDAR_ROUTE;
  const code = params.get("code");

  // No intent to resume, an error reported by Apple, or nothing to exchange.
  if (!savedIntent || params.get("error") || !code) {
    failTo(returnPath);
    return;
  }

  try {
    const result = await AuthApi.loginOrSignup(
      buildAppleAuthCodePayload({
        code,
        state,
        user: params.get("user") ?? undefined,
      }),
    );
    await completeAuthentication({
      email: result.user.emails?.[0],
    });

    if (result.createdNewRecipeUser) {
      trackSignupCompleted("apple");
    } else {
      track("login_completed", { method: "apple" });
    }

    navigate(returnPath, { replace: true });
  } catch {
    failTo(returnPath);
  }
}

export function AppleAuthCallbackView() {
  const location = useLocation();
  const router = useRouter();
  const completeAuthentication = useCompleteAuthentication();
  const shouldRelay = shouldRelayDesktopAppleOAuthCallback(
    location.searchStr,
    false,
  );

  useOneShotAuthCallback(() => {
    if (shouldRelay) {
      return;
    }
    completeAppleAuthCallback({
      completeAuthentication,
      navigate: (path) => router.history.replace(path),
      search: location.searchStr,
    }).catch(
      reportAuthCallbackCrash({
        method: "apple",
        errorMessage: APPLE_AUTHORIZATION_ERROR_MESSAGE,
        replace: (path) => router.history.replace(path),
      }),
    );
  });

  if (shouldRelay) {
    return (
      <DesktopOAuthCallbackRelay provider="apple" search={location.searchStr} />
    );
  }

  return <AuthCallbackOverlay />;
}
