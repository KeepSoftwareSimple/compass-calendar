import {
  clearProviderAuthorizationIntent,
  consumeGoogleAuthNeedsConsentRetry,
  markGoogleAuthNeedsConsentRetry,
  type ProviderAuthorizationIntent,
  readProviderAuthorizationIntent,
  writeProviderAuthorizationIntent,
} from "@web/auth/providers/authorization/provider-authorization.storage";

export type GoogleAuthorizationIntent = ProviderAuthorizationIntent;

export function writeGoogleAuthorizationIntent(
  state: string,
  intent: GoogleAuthorizationIntent,
): void {
  writeProviderAuthorizationIntent("google", state, intent);
}

export function readGoogleAuthorizationIntent(
  state: string,
): GoogleAuthorizationIntent | null {
  return readProviderAuthorizationIntent("google", state);
}

export function clearGoogleAuthorizationIntent(state: string): void {
  clearProviderAuthorizationIntent("google", state);
}

export { consumeGoogleAuthNeedsConsentRetry, markGoogleAuthNeedsConsentRetry };
