import {
  type UseGoogleLoginOptionsAuthCodeFlow,
  useGoogleLogin as useGoogleLoginBase,
} from "@react-oauth/google";
import { useCallback, useMemo, useState } from "react";
import { buildOAuthStateForClient } from "@core/desktop/desktop-oauth-state.util";
import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { rememberSignupTrialMethod } from "@web/billing/signup-trial.util";
import { isDesktop } from "@web/desktop/isDesktop";
import {
  getAppleSignInClientId,
  getMicrosoftSignInClientId,
} from "./provider-authorization.config";
import { assignAuthorizationRedirect } from "./provider-authorization.redirect";
import {
  type ProviderAuthorizationIntent,
  writeProviderAuthorizationIntent,
} from "./provider-authorization.storage";
import {
  buildAppleAuthorizationState,
  buildAppleAuthorizationUrl,
  buildMicrosoftAuthorizationUrl,
  buildProviderAuthCallbackUrl,
  buildSignupTrialReturnPath,
  getSafeProviderAuthReturnPath,
} from "./provider-authorization.util";

type StartProviderAuthorizationOptions = {
  intent: ProviderAuthorizationIntent["intent"];
  /** Sign-up (not log-in) OAuth should return to the in-modal trial step. */
  signupFlow?: boolean;
  onStart?: () => void;
  onError?: (error: unknown) => void;
  prompt?: "consent" | "none" | "select_account";
};

type StartProviderAuthorizationResult = {
  loading: boolean;
  startAuthorization: () => void;
};

type ProviderAuthorizationStrategy = (
  options: StartProviderAuthorizationOptions,
) => StartProviderAuthorizationResult;

const useGoogleProviderAuthorizationStrategy: ProviderAuthorizationStrategy = ({
  intent,
  signupFlow,
  onStart,
  onError,
  prompt,
}) => {
  const [loading, setLoading] = useState(false);
  const [state] = useState(() => buildOAuthStateForClient(isDesktop()));
  const [redirectUri] = useState(() => buildProviderAuthCallbackUrl("google"));

  const loginOptions = useMemo<
    UseGoogleLoginOptionsAuthCodeFlow & {
      prompt?: "consent" | "none" | "select_account";
    }
  >(
    () => ({
      flow: "auth-code",
      scope: GOOGLE_SCOPES.join(" "),
      prompt,
      state,
      ux_mode: "redirect",
      redirect_uri: redirectUri,
      onNonOAuthError(error) {
        setLoading(false);
        onError?.(error);
      },
      onError(error) {
        setLoading(false);
        onError?.(error);
      },
    }),
    [onError, prompt, redirectUri, state],
  );

  const startGoogleAuthorization = useGoogleLoginBase(loginOptions);

  return {
    loading,
    startAuthorization: useCallback(() => {
      onStart?.();
      setLoading(true);
      if (signupFlow) {
        rememberSignupTrialMethod("google");
      }
      writeProviderAuthorizationIntent("google", state, {
        intent,
        returnPath: signupFlow
          ? buildSignupTrialReturnPath()
          : getSafeProviderAuthReturnPath("google"),
        createdAt: Date.now(),
      });
      track("oauth_redirect_started", { provider: "google", intent });
      trackSignupStep("oauth_redirect_started", { method: "google" });
      return startGoogleAuthorization();
    }, [intent, onStart, signupFlow, startGoogleAuthorization, state]),
  };
};

const useMicrosoftProviderAuthorizationStrategy: ProviderAuthorizationStrategy =
  ({ intent, signupFlow, onStart, onError, prompt }) => {
    const [loading, setLoading] = useState(false);
    const [state] = useState(() => buildOAuthStateForClient(isDesktop()));
    const [redirectUri] = useState(() =>
      buildProviderAuthCallbackUrl("microsoft"),
    );

    return {
      loading,
      startAuthorization: useCallback(() => {
        const clientId = getMicrosoftSignInClientId();

        if (!clientId) {
          onError?.(new Error("Microsoft sign-in is not configured"));
          return;
        }

        onStart?.();
        setLoading(true);
        if (signupFlow) {
          rememberSignupTrialMethod("microsoft");
        }
        writeProviderAuthorizationIntent("microsoft", state, {
          intent,
          returnPath: signupFlow
            ? buildSignupTrialReturnPath()
            : getSafeProviderAuthReturnPath("microsoft"),
          createdAt: Date.now(),
        });
        track("oauth_redirect_started", { provider: "microsoft", intent });
        trackSignupStep("oauth_redirect_started", { method: "microsoft" });

        try {
          assignAuthorizationRedirect(
            buildMicrosoftAuthorizationUrl({
              clientId,
              redirectUri,
              scopes: MICROSOFT_SCOPES,
              state,
              prompt,
            }),
          );
        } catch (error) {
          setLoading(false);
          onError?.(error);
        }
      }, [intent, onError, onStart, prompt, redirectUri, signupFlow, state]),
    };
  };

const useAppleProviderAuthorizationStrategy: ProviderAuthorizationStrategy = ({
  intent,
  signupFlow,
  onStart,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [state] = useState(() =>
    buildAppleAuthorizationState(buildProviderAuthCallbackUrl("apple")),
  );

  return {
    loading,
    startAuthorization: useCallback(() => {
      const clientId = getAppleSignInClientId();
      if (!clientId) {
        onError?.(new Error("Apple sign-in is not configured"));
        return;
      }
      onStart?.();
      setLoading(true);
      if (signupFlow) {
        rememberSignupTrialMethod("apple");
      }
      writeProviderAuthorizationIntent("apple", state, {
        intent,
        returnPath: signupFlow
          ? buildSignupTrialReturnPath()
          : getSafeProviderAuthReturnPath("apple"),
        createdAt: Date.now(),
      });
      track("oauth_redirect_started", { provider: "apple", intent });
      trackSignupStep("oauth_redirect_started", { method: "apple" });
      try {
        assignAuthorizationRedirect(
          buildAppleAuthorizationUrl({ clientId, state }),
        );
      } catch (error) {
        setLoading(false);
        onError?.(error);
      }
    }, [intent, onError, onStart, signupFlow, state]),
  };
};

const PROVIDER_AUTHORIZATION_STRATEGIES: Record<
  ProviderKind,
  ProviderAuthorizationStrategy
> = {
  google: useGoogleProviderAuthorizationStrategy,
  microsoft: useMicrosoftProviderAuthorizationStrategy,
  apple: useAppleProviderAuthorizationStrategy,
};

export const useStartProviderAuthorizationImpl = (
  provider: ProviderKind,
  options: StartProviderAuthorizationOptions,
): StartProviderAuthorizationResult =>
  PROVIDER_AUTHORIZATION_STRATEGIES[provider](options);
