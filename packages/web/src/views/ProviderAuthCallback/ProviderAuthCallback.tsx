import { useLocation, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { AuthApi } from "@web/api/auth.api";
import { useCompleteAuthentication } from "@web/auth/compass/hooks/useCompleteAuthentication";
import { track } from "@web/auth/posthog/track";
import { completeProviderAuthorization } from "@web/auth/providers/authorization/complete-provider-authorization";
import { isSignInProviderKind } from "@web/auth/providers/authorization/provider-authorization.constants";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
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
  const result = await completeProviderAuthorization({
    provider,
    authApi: AuthApi,
    completeAuthentication,
    search,
  });

  if (result.status === "failed") {
    showErrorToast(result.message);
  } else if (result.isNewUser) {
    track("signup_completed", { method: provider });
    track("calendar_connected", { source: `signup_${provider}` });
    shortcutShowcaseActions.offerAfterSignupIfPending();
  } else {
    track("login_completed", { method: provider });
  }

  navigate(result.returnPath, { replace: true });
}

export function ProviderAuthCallbackView() {
  const didRun = useRef(false);
  const { provider: providerParam } = useParams({ strict: false });
  const location = useLocation();
  const router = useRouter();
  const completeAuthentication = useCompleteAuthentication();

  useEffect(() => {
    if (didRun.current) {
      return;
    }

    didRun.current = true;

    if (!providerParam || !isSignInProviderKind(providerParam)) {
      showErrorToast("We couldn't finish signing you in. Please try again.");
      router.history.replace(DEFAULT_CALENDAR_ROUTE);
      return;
    }

    void completeProviderAuthCallback({
      provider: providerParam,
      completeAuthentication,
      navigate: (path) => router.history.replace(path),
      search: location.searchStr,
    });
  }, [completeAuthentication, location.searchStr, providerParam, router]);

  return (
    <OverlayPanel
      title="Just finishing up …"
      message="Returning you to Compass."
      role="status"
      variant="status"
      icon={
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-text"
          aria-hidden="true"
        />
      }
    />
  );
}
