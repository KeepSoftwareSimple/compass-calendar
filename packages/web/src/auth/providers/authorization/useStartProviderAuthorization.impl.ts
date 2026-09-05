import {
  type UseGoogleLoginOptionsAuthCodeFlow,
  useGoogleLogin as useGoogleLoginBase,
} from "@react-oauth/google";
import { useCallback, useMemo, useState } from "react";
import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { track } from "@web/auth/posthog/track";
import { getMicrosoftSignInClientId } from "./provider-authorization.config";
import { assignAuthorizationRedirect } from "./provider-authorization.redirect";
import {
  type ProviderAuthorizationIntent,
  writeProviderAuthorizationIntent,
} from "./provider-authorization.storage";
import {
  buildMicrosoftAuthorizationUrl,
  buildProviderAuthCallbackUrl,
  getSafeProviderAuthReturnPath,
} from "./provider-authorization.util";

type StartProviderAuthorizationOptions = {
  intent: ProviderAuthorizationIntent["intent"];
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
  onStart,
  onError,
  prompt,
}) => {
  const [loading, setLoading] = useState(false);
  const [state] = useState(() => crypto.randomUUID());
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
      writeProviderAuthorizationIntent("google", state, {
        intent,
        returnPath: getSafeProviderAuthReturnPath("google"),
        createdAt: Date.now(),
      });
      track("oauth_redirect_started", { provider: "google", intent });
      return startGoogleAuthorization();
    }, [intent, onStart, startGoogleAuthorization, state]),
  };
};

const useMicrosoftProviderAuthorizationStrategy: ProviderAuthorizationStrategy =
  ({ intent, onStart, onError, prompt }) => {
    const [loading, setLoading] = useState(false);
    const [state] = useState(() => crypto.randomUUID());
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
        writeProviderAuthorizationIntent("microsoft", state, {
          intent,
          returnPath: getSafeProviderAuthReturnPath("microsoft"),
          createdAt: Date.now(),
        });
        track("oauth_redirect_started", { provider: "microsoft", intent });

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
      }, [intent, onError, onStart, prompt, redirectUri, state]),
    };
  };

const useUnsupportedProviderAuthorizationStrategy: ProviderAuthorizationStrategy =
  ({ onError }) => ({
    loading: false,
    startAuthorization: useCallback(() => {
      onError?.(new Error("This sign-in method is not available yet"));
    }, [onError]),
  });

const PROVIDER_AUTHORIZATION_STRATEGIES: Record<
  ProviderKind,
  ProviderAuthorizationStrategy
> = {
  google: useGoogleProviderAuthorizationStrategy,
  microsoft: useMicrosoftProviderAuthorizationStrategy,
  apple: useUnsupportedProviderAuthorizationStrategy,
};

export const useStartProviderAuthorizationImpl = (
  provider: ProviderKind,
  options: StartProviderAuthorizationOptions,
): StartProviderAuthorizationResult =>
  PROVIDER_AUTHORIZATION_STRATEGIES[provider](options);
