import { useLocation, useParams, useRouter } from "@tanstack/react-router";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { AuthApi } from "@web/api/auth.api";
import { AuthCallbackOverlay } from "@web/auth/callback/AuthCallbackOverlay";
import { useOneShotAuthCallback } from "@web/auth/callback/useOneShotAuthCallback";
import { useCompleteAuthentication } from "@web/auth/compass/hooks/useCompleteAuthentication";
import {
  trackSignupCompleted,
  trackSignupFailed,
  trackSignupStep,
} from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { completeProviderAuthorization } from "@web/auth/providers/authorization/complete-provider-authorization";
import {
  isSignInProviderKind,
  PROVIDER_AUTHORIZATION_ERROR_MESSAGE,
} from "@web/auth/providers/authorization/provider-authorization.constants";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { getToast } from "@web/common/utils/toast/toast.port";
import { shortcutShowcaseActions } from "@web/components/ShortcutShowcase/showcase.store";

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
  // Before any branch: a user who came back from the provider is counted even
  // when the exchange below fails.
  trackSignupStep("oauth_callback_returned", { method: provider });

  const result = await completeProviderAuthorization({
    provider,
    authApi: AuthApi,
    completeAuthentication,
    search,
  });

  if (result.status === "failed") {
    trackSignupFailed(result.reason, {
      method: provider,
      step: "oauth_callback_returned",
    });
    // Cancelling is a choice, not a fault. An error toast for it reads as a
    // Compass failure and discourages the retry that would have worked.
    if (result.reason === "oauth_user_cancelled") {
      getToast().info(result.message, getToastDefaultOptions());
    } else {
      showErrorToast(result.message);
    }
  } else if (result.isNewUser) {
    trackSignupCompleted(provider);
    track("calendar_connected", { source: `signup_${provider}` });
    trackSignupStep("calendar_connected", { method: provider });
    shortcutShowcaseActions.offerAfterSignupIfPending();
  } else {
    track("login_completed", { method: provider });
  }

  navigate(result.returnPath, { replace: true });
}

export function ProviderAuthCallbackView() {
  const { provider: providerParam } = useParams({ strict: false });
  const location = useLocation();
  const router = useRouter();
  const completeAuthentication = useCompleteAuthentication();

  useOneShotAuthCallback(() => {
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
    }).catch(() => {
      trackSignupFailed("oauth_callback_crashed", { method: providerParam });
      showErrorToast(PROVIDER_AUTHORIZATION_ERROR_MESSAGE);
      router.history.replace(DEFAULT_CALENDAR_ROUTE);
    });
  });

  return <AuthCallbackOverlay />;
}
