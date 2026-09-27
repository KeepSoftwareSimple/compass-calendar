import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { ALL_PROVIDER_KINDS } from "@web/auth/providers/connection-provider.util";
import { useIsProviderAvailable } from "@web/auth/providers/useIsProviderAvailable";

/** Provider kinds whose sign-in flow is configured on this deployment. */
export const useAvailableSignInProviders = (): ProviderKind[] => {
  const google = useIsProviderAvailable("google", "signIn");
  const microsoft = useIsProviderAvailable("microsoft", "signIn");
  const apple = useIsProviderAvailable("apple", "signIn");
  const ready: Record<ProviderKind, boolean> = {
    google,
    microsoft,
    apple,
  };
  return ALL_PROVIDER_KINDS.filter((kind) => ready[kind]);
};
