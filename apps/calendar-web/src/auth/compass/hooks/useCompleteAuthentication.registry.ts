import { useCompleteAuthenticationImpl } from "./useCompleteAuthentication.impl";

export type UseCompleteAuthentication = typeof useCompleteAuthenticationImpl;

let useCompleteAuthenticationHook: UseCompleteAuthentication =
  useCompleteAuthenticationImpl;

export function registerUseCompleteAuthenticationForTests(
  hook: UseCompleteAuthentication,
): void {
  useCompleteAuthenticationHook = hook;
}

export function resetUseCompleteAuthenticationForTests(): void {
  useCompleteAuthenticationHook = useCompleteAuthenticationImpl;
}

export function useCompleteAuthenticationFromRegistry(
  ...args: Parameters<UseCompleteAuthentication>
): ReturnType<UseCompleteAuthentication> {
  return useCompleteAuthenticationHook(...args);
}
