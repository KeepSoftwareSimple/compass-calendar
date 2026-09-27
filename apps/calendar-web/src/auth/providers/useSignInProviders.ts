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
};

export function useSignInProviders(options: UseSignInProvidersOptions = {}) {
  const available = useAvailableSignInProviders();
  const googleAuth = useStartProviderAuthorization("google", {
    intent: "signIn",
    onStart: options.google?.onStart,
    prompt: options.google?.prompt,
  });
  const microsoftAuth = useStartProviderAuthorization("microsoft", {
    intent: "signIn",
  });
  const appleAuth = useStartProviderAuthorization("apple", {
    intent: "signIn",
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
