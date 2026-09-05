import { type GoogleAuthCodeRequest } from "@core/types/auth.types";
import {
  buildProviderAuthCallbackUrl,
  buildProviderAuthCodePayload,
  getSafeProviderAuthReturnPath,
} from "@web/auth/providers/authorization/provider-authorization.util";

export function buildGoogleAuthCallbackUrl(origin = window.location.origin) {
  return buildProviderAuthCallbackUrl("google", origin);
}

export function getSafeGoogleAuthReturnPath(
  href = window.location.href,
  origin = window.location.origin,
): string {
  return getSafeProviderAuthReturnPath("google", href, origin);
}

export function buildGoogleAuthCodePayload({
  code,
  scope,
  state,
  redirectUri = buildGoogleAuthCallbackUrl(),
}: {
  code: string;
  scope?: string;
  state?: string;
  redirectUri?: string;
}): GoogleAuthCodeRequest {
  return buildProviderAuthCodePayload({
    provider: "google",
    code,
    scope,
    state,
    redirectUri,
  }) as GoogleAuthCodeRequest;
}
