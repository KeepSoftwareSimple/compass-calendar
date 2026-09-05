import {
  type CompleteProviderAuthorizationOptions,
  type CompleteProviderAuthorizationResult,
  completeProviderAuthorization,
  type ProviderAuthorizationAuthAdapter,
} from "@web/auth/providers/authorization/complete-provider-authorization";

export type GoogleAuthorizationAuthAdapter = ProviderAuthorizationAuthAdapter;

export type CompleteGoogleAuthorizationOptions = Omit<
  CompleteProviderAuthorizationOptions,
  "provider"
>;

export type CompleteGoogleAuthorizationResult =
  CompleteProviderAuthorizationResult;

export async function completeGoogleAuthorization(
  options: CompleteGoogleAuthorizationOptions,
): Promise<CompleteGoogleAuthorizationResult> {
  return completeProviderAuthorization({
    provider: "google",
    ...options,
  });
}
