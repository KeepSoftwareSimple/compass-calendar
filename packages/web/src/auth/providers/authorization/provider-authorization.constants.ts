import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import {
  type ProviderKind,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";

export const PROVIDER_AUTH_INTENT_STORAGE_PREFIX =
  "compass.providerAuthorizationIntent";
export const PROVIDER_AUTH_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

export const GOOGLE_AUTH_INTENT_STORAGE_PREFIX =
  "compass.googleAuthorizationIntent";

export const PROVIDER_AUTH_SCOPES_REQUIRED: Record<
  ProviderKind,
  readonly string[]
> = {
  google: GOOGLE_SCOPES,
  microsoft: MICROSOFT_SCOPES,
  apple: [],
};

export const PROVIDER_AUTHORIZATION_ERROR_MESSAGE =
  "We couldn't finish signing you in. Please try again.";
export const MISSING_PROVIDER_SCOPES_ERROR_MESSAGE =
  "Compass needs all the requested permissions to sync your calendar. Please allow them and try again.";

export const GOOGLE_AUTHORIZATION_ERROR_MESSAGE =
  "We couldn't connect your Google account. Please try again.";

/**
 * Cancelling at the provider's consent screen is a choice, not a crash. It
 * used to share the generic authorization error, which read as a Compass
 * failure and gave no hint that trying again was all it took.
 */
export const PROVIDER_AUTH_CANCELLED_MESSAGE =
  "No problem, nothing was connected. You can sign in anytime.";

export function isSignInProviderKind(value: string): value is ProviderKind {
  return ProviderKindSchema.safeParse(value).success;
}

export function providerAuthCallbackPath(kind: ProviderKind): string {
  return `/auth/${kind}/callback`;
}
