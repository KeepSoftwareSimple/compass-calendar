import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AuthApi } from "@web/api/auth.api";
import { APPLE_AUTHORIZATION_ERROR_MESSAGE } from "@web/auth/apple/authorization/apple-authorization.constants";
import {
  clearAppleAuthorizationIntent,
  readAppleAuthorizationIntent,
} from "@web/auth/apple/authorization/apple-authorization.storage";
import { buildAppleAuthCodePayload } from "@web/auth/apple/authorization/apple-authorization.util";
import { useCompleteAuthentication } from "@web/auth/compass/hooks/useCompleteAuthentication";
import {
  trackSignupCompleted,
  trackSignupStep,
} from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";

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
  const state = params.get("state");

  if (!state) {
    showErrorToast(APPLE_AUTHORIZATION_ERROR_MESSAGE);
    navigate(DEFAULT_CALENDAR_ROUTE, { replace: true });
    return;
  }

  const savedIntent = readAppleAuthorizationIntent(state);
  clearAppleAuthorizationIntent(state);
  const returnPath = savedIntent?.returnPath ?? DEFAULT_CALENDAR_ROUTE;

  if (!savedIntent || params.get("error")) {
    showErrorToast(APPLE_AUTHORIZATION_ERROR_MESSAGE);
    navigate(returnPath, { replace: true });
    return;
  }

  const code = params.get("code");

  if (!code) {
    showErrorToast(APPLE_AUTHORIZATION_ERROR_MESSAGE);
    navigate(returnPath, { replace: true });
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
    showErrorToast(APPLE_AUTHORIZATION_ERROR_MESSAGE);
    navigate(returnPath, { replace: true });
  }
}

export function AppleAuthCallbackView() {
  const didRun = useRef(false);
  const location = useLocation();
  const router = useRouter();
  const completeAuthentication = useCompleteAuthentication();

  useEffect(() => {
    if (didRun.current) {
      return;
    }

    didRun.current = true;

    void completeAppleAuthCallback({
      completeAuthentication,
      navigate: (path) => router.history.replace(path),
      search: location.searchStr,
    });
  }, [completeAuthentication, location.searchStr, router]);

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
