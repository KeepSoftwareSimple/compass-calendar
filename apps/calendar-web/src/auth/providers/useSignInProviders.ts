import { useCallback, useMemo } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { useStartProviderAuthorization } from "@web/auth/providers/authorization/useStartProviderAuthorization";
import { useAvailableSignInProviders } from "@web/auth/providers/useAvailableSignInProviders";

type GoogleSignInOptions = {
  onStart?: () => void;
  prompt?: "consent" | "none" | "select_account";
};

type UseSignInProvidersOptions = {
  google?: GoogleSignInOptions;
  /** When true, OAuth returns to the signup trial step after account creation. */
  signupFlow?: boolean;
};

export function useSignInProviders(options: UseSignInProvidersOptions = {}) {
  const available = useAvailableSignInProviders();
  const signupFlow = options.signupFlow === true;
  const googleAuth = useStartProviderAuthorization("google", {
    intent: "signIn",
    signupFlow,
    onStart: options.google?.onStart,
    prompt: options.google?.prompt,
  });
  const microsoftAuth = useStartProviderAuthorization("microsoft", {
    intent: "signIn",
    signupFlow,
  });
  const appleAuth = useStartProviderAuthorization("apple", {
    intent: "signIn",
    signupFlow,
  });

  const byKind = useMemo(
    () => ({
      google: googleAuth,
      microsoft: microsoftAuth,
      apple: appleAuth,
    }),
    [appleAuth, googleAuth, microsoftAuth],
  );

  const loadingKind = available.find((kind) => byKind[kind].loading) ?? null;
  const isLoading = loadingKind != null;

  const startSignIn = useCallback(
    (kind: ProviderKind) => {
      byKind[kind].startAuthorization();
    },
    [byKind],
  );

  return {
    available,
    byKind,
    isLoading,
    loadingKind,
    startSignIn,
  };
}
