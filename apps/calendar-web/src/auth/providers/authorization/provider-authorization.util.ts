import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { buildAppleSignInRedirectUri } from "@web/auth/apple/authorization/apple-authorization.util";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import { providerAuthCallbackPath } from "./provider-authorization.constants";
import { thirdPartyIdForProviderKind } from "./provider-authorization.third-party";

/** The `prompt` values Compass passes through to a provider consent screen. */
export type AuthorizationPrompt = "consent" | "none" | "select_account";

export type ProviderAuthCodeRequest = {
  thirdPartyId: ReturnType<typeof thirdPartyIdForProviderKind>;
  clientType: "web";
  redirectURIInfo: {
    redirectURIOnProviderDashboard: string;
    redirectURIQueryParams: {
      code: string;
      scope?: string;
      state?: string;
    };
    pkceCodeVerifier?: string;
  };
};

export function buildProviderAuthCallbackUrl(
  provider: ProviderKind,
  origin = window.location.origin,
): string {
  return `${origin}${providerAuthCallbackPath(provider)}`;
}

export function buildSignupTrialReturnPath(
  href = window.location.href,
  origin = window.location.origin,
): string {
  const base = getSafeProviderAuthReturnPath("google", href, origin);
  const url = new URL(base, origin);
  url.searchParams.set("auth", "trial");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getSafeProviderAuthReturnPath(
  provider: ProviderKind,
  href = window.location.href,
  origin = window.location.origin,
): string {
  try {
    const url = new URL(href, origin);

    if (url.origin !== origin) {
      return DEFAULT_CALENDAR_ROUTE;
    }

    if (url.pathname === providerAuthCallbackPath(provider)) {
      return DEFAULT_CALENDAR_ROUTE;
    }

    url.searchParams.delete("auth");
    url.searchParams.delete("token");

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_CALENDAR_ROUTE;
  }
}

export function buildProviderAuthCodePayload({
  provider,
  code,
  scope,
  state,
  redirectUri,
}: {
  provider: ProviderKind;
  code: string;
  scope?: string;
  state?: string;
  redirectUri?: string;
}): ProviderAuthCodeRequest {
  return {
    thirdPartyId: thirdPartyIdForProviderKind(provider),
    clientType: "web",
    redirectURIInfo: {
      redirectURIOnProviderDashboard:
        redirectUri ?? buildProviderAuthCallbackUrl(provider),
      redirectURIQueryParams: { code, scope, state },
    },
  };
}

export function buildMicrosoftAuthorizationUrl({
  clientId,
  redirectUri,
  scopes,
  state,
  prompt,
}: {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  prompt?: AuthorizationPrompt;
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: scopes.join(" "),
    state,
  });

  if (prompt) {
    params.set("prompt", prompt);
  }

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export function buildAppleAuthorizationUrl({
  clientId,
  state,
}: {
  clientId: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: buildAppleSignInRedirectUri(),
    response_mode: "form_post",
    scope: "name email",
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}
