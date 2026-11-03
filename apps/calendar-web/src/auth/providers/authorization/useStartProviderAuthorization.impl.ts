import {
  type UseGoogleLoginOptionsAuthCodeFlow,
  useGoogleLogin as useGoogleLoginBase,
} from "@react-oauth/google";
import { useCallback, useMemo, useState } from "react";
import { buildSignInOAuthState } from "@core/auth/signin-oauth-state.util";
import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { readPosthogDistinctIdForOAuth } from "@web/auth/posthog/posthog-distinct-id.util";
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
  /** Google only: request a subset of scopes (incremental authorization). */
  scopes?: readonly string[];
  /** Google only: keep scopes the user already granted on prior consent. */
  includeGrantedScopes?: boolean;
};

type StartProviderAuthorizationResult = {
  loading: boolean;
  startAuthorization: () => void;
};

type ProviderAuthorizationStrategy = (
  options: StartProviderAuthorizationOptions,
) => StartProviderAuthorizationResult;

/** The `state` and callback URL one mount's authorization attempt is pinned to. */
type AuthorizationSession = {
  state: string;
  redirectUri: string;
};

type CreateOAuthState = (
  redirectUri: string,
  posthogDistinctId: string | undefined,
  signupFlow: boolean | undefined,
) => string;

/**
 * Pins the OAuth `state` and callback URL for the life of the mount, so the
 * value handed to the consent screen is the one the callback later looks up.
 * Built lazily because `crypto.randomUUID` and `window.location` should not be
 * read on every render.
 */
function useAuthorizationSession(
  provider: ProviderKind,
  createState: CreateOAuthState,
  signupFlow?: boolean,
): AuthorizationSession {
  const [session] = useState<AuthorizationSession>(() => {
    const redirectUri = buildProviderAuthCallbackUrl(provider);
    return {
      state: createState(
        redirectUri,
        readPosthogDistinctIdForOAuth(),
        signupFlow,
      ),
      redirectUri,
    };
  });
  return session;
}

/**
 * The bookkeeping every provider does before handing the browser to a consent
 * screen: remember the trial method, store the intent under the OAuth state so
 * the callback can recover the return path, and report the funnel step. Each
 * strategy then launches its own way, which is all they still spell out.
 */
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
    ...(signupFlow ? { signupFlow: true } : {}),
  });
  track("oauth_redirect_started", { provider, intent });
  trackSignupStep("oauth_redirect_started", { method: provider });
}

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

type RedirectAuthorizationSpec = {
  provider: ProviderKind;
  /**
   * Empty when the provider has no client id configured for this deployment.
   * Called per attempt, not captured, so the config module stays mockable.
   */
  getClientId: () => string;
  notConfiguredMessage: string;
  createState: CreateOAuthState;
  buildAuthorizationUrl: (
    args: AuthorizationSession & {
      clientId: string;
      prompt?: AuthorizationPrompt;
    },
  ) => string;
};

/**
 * Microsoft and Apple both authorize by navigating the whole page to a
 * provider URL, so they share everything but the client id, the `state` shape,
 * and the URL itself. Google can't use this: `useGoogleLogin` owns its own
 * launch and reports errors through callbacks instead of a thrown navigation.
 */
function createRedirectAuthorizationStrategy({
  provider,
  getClientId,
  notConfiguredMessage,
  createState,
  buildAuthorizationUrl,
}: RedirectAuthorizationSpec): ProviderAuthorizationStrategy {
  return ({ intent, signupFlow, onStart, onError, prompt }) => {
    const [loading, setLoading] = useState(false);
    const session = useAuthorizationSession(provider, createState, signupFlow);

    return {
      loading,
      startAuthorization: useCallback(() => {
        const clientId = getClientId();

        if (!clientId) {
          onError?.(new Error(notConfiguredMessage));
          return;
        }

        onStart?.();
        setLoading(true);
        recordAuthorizationStart(provider, session.state, {
          intent,
          signupFlow,
        });

        assignAuthorizationRedirectOrReportError(
          buildAuthorizationUrl({ ...session, clientId, prompt }),
          setLoading,
          onError,
        );
      }, [intent, onError, onStart, prompt, session, signupFlow]),
    };
  };
}

const useGoogleProviderAuthorizationStrategy: ProviderAuthorizationStrategy = ({
  intent,
  signupFlow,
  onStart,
  onError,
  prompt,
  scopes,
  includeGrantedScopes,
}) => {
  const [loading, setLoading] = useState(false);
  const { state, redirectUri } = useAuthorizationSession(
    "google",
    (_redirectUri, posthogDistinctId, signupFlow) =>
      buildSignInOAuthState({
        isDesktopClient: false,
        posthogDistinctId,
        flow: signupFlow ? "signup" : "login",
      }),
    signupFlow,
  );

  const loginOptions = useMemo<
    UseGoogleLoginOptionsAuthCodeFlow & { prompt?: AuthorizationPrompt }
  >(
    () => ({
      flow: "auth-code",
      scope: (scopes ?? GOOGLE_SCOPES).join(" "),
      ...(includeGrantedScopes ? { include_granted_scopes: true } : {}),
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
    [includeGrantedScopes, onError, prompt, redirectUri, scopes, state],
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

const useMicrosoftProviderAuthorizationStrategy =
  createRedirectAuthorizationStrategy({
    provider: "microsoft",
    getClientId: () => getMicrosoftSignInClientId(),
    notConfiguredMessage: "Microsoft sign-in is not configured",
    createState: (_redirectUri, posthogDistinctId, signupFlow) =>
      buildSignInOAuthState({
        isDesktopClient: false,
        posthogDistinctId,
        flow: signupFlow ? "signup" : "login",
      }),
    buildAuthorizationUrl: ({ clientId, redirectUri, state, prompt }) =>
      buildMicrosoftAuthorizationUrl({
        clientId,
        redirectUri,
        scopes: MICROSOFT_SCOPES,
        state,
        prompt,
      }),
  });

const useAppleProviderAuthorizationStrategy =
  createRedirectAuthorizationStrategy({
    provider: "apple",
    getClientId: () => getAppleSignInClientId(),
    notConfiguredMessage: "Apple sign-in is not configured",
    // Apple returns to the backend form_post route, so the frontend callback it
    // should land on afterwards rides along inside the state.
    createState: (redirectUri, posthogDistinctId, signupFlow) =>
      btoa(
        JSON.stringify({
          frontendRedirectURI: redirectUri,
          nonce: crypto.randomUUID(),
          ...(posthogDistinctId ? { ph: posthogDistinctId } : {}),
          fl: signupFlow ? "signup" : "login",
        }),
      ),
    buildAuthorizationUrl: ({ clientId, state }) =>
      buildAppleAuthorizationUrl({ clientId, state }),
  });

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
