import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { ALL_PROVIDER_KINDS } from "@web/auth/providers/connection-provider.util";
import { useIsProviderAvailable } from "@web/auth/providers/useIsProviderAvailable";

/** Provider kinds whose connect flow is configured on this deployment. */
export const useAvailableConnectProviders = (): ProviderKind[] => {
  const google = useIsProviderAvailable("google", "connect");
  const microsoft = useIsProviderAvailable("microsoft", "connect");
  const apple = useIsProviderAvailable("apple", "connect");
  const ready: Record<ProviderKind, boolean> = {
    google,
    microsoft,
    apple,
  };
  return ALL_PROVIDER_KINDS.filter((kind) => ready[kind]);
};
