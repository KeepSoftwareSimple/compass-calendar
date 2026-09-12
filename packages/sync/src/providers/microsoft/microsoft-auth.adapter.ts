import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import { ProviderAccountFactsSchema } from "@core/types/sync/connection.contracts";
import { isMicrosoftConsentRequired } from "@sync/providers/microsoft/microsoft-consent";
import {
  type ProviderAuthAdapter,
  ProviderAuthError,
  type ProviderAuthorization,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";
import { redactedCause } from "@sync/safety/redact-error";

export const MICROSOFT_AUTHORIZE_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const MICROSOFT_JWKS_URL =
  "https://login.microsoftonline.com/common/discovery/v2.0/keys";

export interface MicrosoftTokenResponse {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly id_token?: string;
  readonly scope?: string;
  readonly expires_in?: number;
  readonly token_type?: string;
  readonly error?: string;
  readonly error_description?: string;
}

export interface MicrosoftIdTokenClaims extends JWTPayload {
  readonly oid?: string;
  readonly preferred_username?: string;
  readonly email?: string;
  readonly name?: string;
}

// Narrow token-endpoint surface the adapter depends on. Tests inject a fake
// that replays fixture responses without network access.
export interface MicrosoftTokenEndpoint {
  exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<MicrosoftTokenResponse>;

  refreshAccessToken(input: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }): Promise<MicrosoftTokenResponse>;
}

export interface MicrosoftIdTokenVerifier {
  verify(idToken: string, audience: string): Promise<MicrosoftIdTokenClaims>;
}

export type MicrosoftTokenEndpointFactory = () => MicrosoftTokenEndpoint;
export type MicrosoftIdTokenVerifierFactory = (
  clientId: string,
) => MicrosoftIdTokenVerifier;

// Microsoft implementation of the provider authorization port. Identity is the
// verified id-token `oid` — never the email, which is mutable and reassignable.
export class MicrosoftAuthAdapter implements ProviderAuthAdapter {
  #clientId: string;
  #clientSecret: string;
  #makeTokenEndpoint: MicrosoftTokenEndpointFactory;
  #makeIdTokenVerifier: MicrosoftIdTokenVerifierFactory;

  constructor(
    clientId: string,
    clientSecret: string,
    makeTokenEndpoint: MicrosoftTokenEndpointFactory = () =>
      new FetchMicrosoftTokenEndpoint(),
    makeIdTokenVerifier: MicrosoftIdTokenVerifierFactory = () =>
      new JwksMicrosoftIdTokenVerifier(),
  ) {
    if (!clientId || !clientSecret) {
      throw new Error(
        "MicrosoftAuthAdapter requires a Microsoft client id and secret",
      );
    }
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#makeTokenEndpoint = makeTokenEndpoint;
    this.#makeIdTokenVerifier = makeIdTokenVerifier;
  }

  buildAuthorizationUrl(input: {
    state: string;
    redirectUri: string;
    selectAccount?: boolean;
    loginHint?: string;
    extraScopes?: readonly string[];
  }): string {
    const url = new URL(MICROSOFT_AUTHORIZE_URL);
    url.searchParams.set("client_id", this.#clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");
    url.searchParams.set(
      "scope",
      [...MICROSOFT_SCOPES, ...(input.extraScopes ?? [])].join(" "),
    );
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    // Microsoft accepts exactly one prompt value. First connection uses
    // consent so offline_access returns a refresh token. Adding an account
    // uses select_account so the chooser appears; a later missing refresh
    // token is already handled as missingRefreshToken and re-consent.
    url.searchParams.set(
      "prompt",
      input.selectAccount ? "select_account" : "consent",
    );
    if (input.loginHint) {
      url.searchParams.set("login_hint", input.loginHint);
    }
    return url.toString();
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderAuthorization> {
    const tokenEndpoint = this.#makeTokenEndpoint();
    let response: MicrosoftTokenResponse;
    try {
      response = await tokenEndpoint.exchangeAuthorizationCode({
        code: input.code,
        redirectUri: input.redirectUri,
        clientId: this.#clientId,
        clientSecret: this.#clientSecret,
      });
    } catch (error) {
      throw new ProviderAuthError(
        "exchangeFailed",
        "Microsoft rejected the authorization code exchange",
        { cause: redactedCause(error) },
      );
    }

    if (response.error) {
      throw consentOrExchangeError(
        response.error,
        response.error_description,
        "Microsoft rejected the authorization code exchange",
      );
    }

    if (!response.refresh_token) {
      throw new ProviderAuthError(
        "missingRefreshToken",
        "Microsoft returned no refresh token; re-consent is required",
      );
    }
    if (!response.id_token) {
      throw new ProviderAuthError(
        "invalidIdToken",
        "Microsoft returned no id token to identify the account",
      );
    }

    const claims = await this.verifyIdToken(response.id_token);
    if (!claims.oid) {
      throw new ProviderAuthError(
        "missingIdentity",
        "Microsoft id token carried no subject to identify the account",
      );
    }

    const account = ProviderAccountFactsSchema.parse({
      providerAccountId: claims.oid,
      email: claims.preferred_username || claims.email || null,
      displayName: claims.name || null,
    });

    return {
      account,
      refreshToken: response.refresh_token,
      grantedScopes: parseGrantedScopes(response.scope),
    };
  }

  async refreshAccessToken(input: {
    refreshToken: string;
  }): Promise<RefreshedCredential> {
    const tokenEndpoint = this.#makeTokenEndpoint();
    let response: MicrosoftTokenResponse;
    try {
      response = await tokenEndpoint.refreshAccessToken({
        refreshToken: input.refreshToken,
        clientId: this.#clientId,
        clientSecret: this.#clientSecret,
      });
    } catch (error) {
      throw new ProviderAuthError(
        isRefreshPermanentlyRejected(error)
          ? "authorizationRevoked"
          : "refreshFailed",
        "Microsoft rejected the refresh token",
        { cause: redactedCause(error) },
      );
    }

    if (response.error) {
      throw consentOrExchangeError(
        response.error,
        response.error_description,
        "Microsoft rejected the refresh token",
        isRefreshPermanentlyRejectedResponse(response)
          ? "authorizationRevoked"
          : "refreshFailed",
      );
    }

    if (!response.access_token || response.expires_in === undefined) {
      throw new ProviderAuthError(
        "refreshFailed",
        "Microsoft returned no access token or expiry on refresh",
      );
    }

    return {
      accessToken: response.access_token,
      expiresAt: new Date(Date.now() + response.expires_in * 1000),
      grantedScopes: parseGrantedScopes(response.scope),
    };
  }

  async revoke(_input: { token: string }): Promise<void> {
    // Microsoft Entra has no token-revocation endpoint for delegated OAuth
    // tokens. Disconnect removes the stored credential locally; this is a
    // documented no-op so callers can still invoke revoke uniformly.
  }

  private async verifyIdToken(
    idToken: string,
  ): Promise<MicrosoftIdTokenClaims> {
    try {
      return await this.#makeIdTokenVerifier(this.#clientId).verify(
        idToken,
        this.#clientId,
      );
    } catch (error) {
      throw new ProviderAuthError(
        "invalidIdToken",
        "Microsoft id token failed verification",
        { cause: redactedCause(error) },
      );
    }
  }
}

class FetchMicrosoftTokenEndpoint implements MicrosoftTokenEndpoint {
  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<MicrosoftTokenResponse> {
    return postTokenEndpoint({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    });
  }

  async refreshAccessToken(input: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }): Promise<MicrosoftTokenResponse> {
    return postTokenEndpoint({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    });
  }
}

class JwksMicrosoftIdTokenVerifier implements MicrosoftIdTokenVerifier {
  #jwks = createRemoteJWKSet(new URL(MICROSOFT_JWKS_URL));

  async verify(
    idToken: string,
    audience: string,
  ): Promise<MicrosoftIdTokenClaims> {
    const { payload } = await jwtVerify(idToken, this.#jwks, {
      audience,
    });
    return payload as MicrosoftIdTokenClaims;
  }
}

async function postTokenEndpoint(
  body: Record<string, string>,
): Promise<MicrosoftTokenResponse> {
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = (await response.json()) as MicrosoftTokenResponse;
  if (!response.ok && !data.error) {
    throw Object.assign(new Error("token_endpoint_error"), {
      response: { status: response.status, data },
    });
  }
  return data;
}

function consentOrExchangeError(
  error: string,
  description: string | undefined,
  message: string,
  fallbackReason:
    | "exchangeFailed"
    | "refreshFailed"
    | "authorizationRevoked" = "exchangeFailed",
): never {
  if (isMicrosoftConsentRequired(error, description)) {
    throw new ProviderAuthError(
      "consentRequired",
      "Microsoft requires admin consent before Compass can connect",
    );
  }
  throw new ProviderAuthError(fallbackReason, message);
}

const PERMANENT_REFRESH_ERRORS = new Set(["invalid_grant"]);

function tokenEndpointErrorCode(error: unknown): string | undefined {
  const data = (
    error as {
      response?: { data?: { error?: unknown } };
    }
  )?.response?.data;
  return typeof data?.error === "string" ? data.error : undefined;
}

function tokenEndpointStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

function isRefreshPermanentlyRejected(error: unknown): boolean {
  const code = tokenEndpointErrorCode(error);
  if (code && PERMANENT_REFRESH_ERRORS.has(code)) return true;
  const status = tokenEndpointStatus(error);
  return status === 400 || status === 401;
}

function isRefreshPermanentlyRejectedResponse(
  response: MicrosoftTokenResponse,
): boolean {
  return Boolean(
    response.error && PERMANENT_REFRESH_ERRORS.has(response.error),
  );
}

function parseGrantedScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope.split(/\s+/).filter(Boolean);
}
