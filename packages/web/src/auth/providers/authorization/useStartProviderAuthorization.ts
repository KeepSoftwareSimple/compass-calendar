import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { useStartProviderAuthorizationImpl } from "./useStartProviderAuthorization.impl";

export function useStartProviderAuthorization(
  provider: ProviderKind,
  options: Parameters<typeof useStartProviderAuthorizationImpl>[1],
): ReturnType<typeof useStartProviderAuthorizationImpl> {
  return useStartProviderAuthorizationImpl(provider, options);
}
