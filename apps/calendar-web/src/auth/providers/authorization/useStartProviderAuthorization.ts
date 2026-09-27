import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { useStartProviderAuthorizationImpl } from "./useStartProviderAuthorization.impl";

export type UseStartProviderAuthorization =
  typeof useStartProviderAuthorizationImpl;

let useStartProviderAuthorizationHook: UseStartProviderAuthorization =
  useStartProviderAuthorizationImpl;

export function registerUseStartProviderAuthorizationForTests(
  hook: UseStartProviderAuthorization,
): void {
  useStartProviderAuthorizationHook = hook;
}

export function resetUseStartProviderAuthorizationForTests(): void {
  useStartProviderAuthorizationHook = useStartProviderAuthorizationImpl;
}

export function useStartProviderAuthorization(
  provider: ProviderKind,
  options: Parameters<typeof useStartProviderAuthorizationImpl>[1],
): ReturnType<typeof useStartProviderAuthorizationImpl> {
  return useStartProviderAuthorizationHook(provider, options);
}
