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
  type AuthorizationPrompt,
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
  prompt?: AuthorizationPrompt;
};

type StartProviderAuthorizationResult = {
  loading: boolean;
  startAuthorization: () => void;
};

type ProviderAuthorizationStrategy = (
  options: StartProviderAuthorizationOptions,
) => StartProviderAuthorizationResult;

/**
 * The bookkeeping every provider does before handing the browser to a consent
 * screen: remember the trial method, store the intent under the OAuth state so
 * the callback can recover the return path, and report the funnel step. Each
 * strategy then launches its own way, which is all they still spell out.
 */
function assignAuthorizationRedirectOrReportError(
  url: string,
  setLoading: (loading: boolean) => void,
  onError?: (error: unknown) => void,
): void {
  try {
    assignAuthorizationRedirect(url);
  } catch (error) {
    setLoading(false);
    onError?.(error);
  }
}

function recordAuthorizationStart(
  provider: ProviderKind,
  state: string,
  {
    intent,
    signupFlow,
  }: Pick<StartProviderAuthorizationOptions, "intent" | "signupFlow">,
): void {
  if (signupFlow) {
    rememberSignupTrialMethod(provider);
  }
  writeProviderAuthorizationIntent(provider, state, {
    intent,
    returnPath: signupFlow
      ? buildSignupTrialReturnPath()
      : getSafeProviderAuthReturnPath(provider),
    createdAt: Date.now(),
  });
  track("oauth_redirect_started", { provider, intent });
  trackSignupStep("oauth_redirect_started", { method: provider });
}

const useGoogleProviderAuthorizationStrategy: ProviderAuthorizationStrategy = ({
  intent,
  signupFlow,
  onStart,
  onError,
  prompt,
}) => {
  const [loading, setLoading] = useState(false);
  const [state] = useState(() => buildOAuthStateForClient(false));
  const [redirectUri] = useState(() => buildProviderAuthCallbackUrl("google"));

  const loginOptions = useMemo<
    UseGoogleLoginOptionsAuthCodeFlow & { prompt?: AuthorizationPrompt }
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
      recordAuthorizationStart("google", state, { intent, signupFlow });
      return startGoogleAuthorization();
    }, [intent, onStart, signupFlow, startGoogleAuthorization, state]),
  };
};

const useMicrosoftProviderAuthorizationStrategy: ProviderAuthorizationStrategy =
  ({ intent, signupFlow, onStart, onError, prompt }) => {
    const [loading, setLoading] = useState(false);
    const [state] = useState(() => buildOAuthStateForClient(false));
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
        recordAuthorizationStart("microsoft", state, { intent, signupFlow });

        assignAuthorizationRedirectOrReportError(
          buildMicrosoftAuthorizationUrl({
            clientId,
            redirectUri,
            scopes: MICROSOFT_SCOPES,
            state,
            prompt,
          }),
          setLoading,
          onError,
        );
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
  // Apple returns to the backend form_post route, so the frontend callback it
  // should land on afterwards rides along inside the state.
  const [state] = useState(() =>
    btoa(
      JSON.stringify({
        frontendRedirectURI: buildProviderAuthCallbackUrl("apple"),
        nonce: crypto.randomUUID(),
      }),
    ),
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
      recordAuthorizationStart("apple", state, { intent, signupFlow });

      assignAuthorizationRedirectOrReportError(
        buildAppleAuthorizationUrl({ clientId, state }),
        setLoading,
        onError,
      );
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
