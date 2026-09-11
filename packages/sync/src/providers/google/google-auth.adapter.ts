import {
  type Credentials,
  OAuth2Client,
  type TokenPayload,
} from "google-auth-library";
import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { ProviderAccountFactsSchema } from "@core/types/sync/connection.contracts";
import { googleStatus } from "@sync/providers/google/google-error";
import {
  type ProviderAuthAdapter,
  ProviderAuthError,
  type ProviderAuthorization,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";
import { redactedCause } from "@sync/safety/redact-error";

// The subset of google-auth-library's OAuth2Client the adapter uses. Depending
// on an interface (not the concrete client) lets tests supply a plain fake
// without mocking the module or reaching across the network.
export interface GoogleOAuthClient {
  generateAuthUrl(options: {
    access_type: string;
    prompt?: string;
    scope: string[];
    state?: string;
    include_granted_scopes?: boolean;
    login_hint?: string;
  }): string;
  getToken(code: string): Promise<{ tokens: Credentials }>;
  verifyIdToken(options: { idToken: string; audience: string }): Promise<{
    getPayload(): TokenPayload | undefined;
  }>;
  setCredentials(credentials: { refresh_token: string }): void;
  refreshAccessToken(): Promise<{ credentials: Credentials }>;
  revokeToken(token: string): Promise<unknown>;
}

// The redirect URI matters only for authorization/exchange; refresh and revoke
// hit the token endpoint and don't use it, so it is optional.
export type GoogleOAuthClientFactory = (
  redirectUri?: string,
) => GoogleOAuthClient;

// Google implementation of the provider authorization port. Identity is the
// verified id-token `sub` — never the email, which is mutable and reassignable.
export class GoogleAuthAdapter implements ProviderAuthAdapter {
  #clientId: string;
  #makeClient: GoogleOAuthClientFactory;

  constructor(
    clientId: string,
    clientSecret: string,
    makeClient: GoogleOAuthClientFactory = (redirectUri) =>
      new OAuth2Client(clientId, clientSecret, redirectUri),
  ) {
    if (!clientId || !clientSecret) {
      throw new Error(
        "GoogleAuthAdapter requires a Google client id and secret",
      );
    }
    this.#clientId = clientId;
    this.#makeClient = makeClient;
  }

  buildAuthorizationUrl(input: {
    state: string;
    redirectUri: string;
    selectAccount?: boolean;
    loginHint?: string;
    extraScopes?: readonly string[];
  }): string {
    return this.#makeClient(input.redirectUri).generateAuthUrl({
      // offline + consent guarantees a refresh token even on re-authorization,
      // which Google otherwise omits after the first consent. select_account
      // additionally forces the chooser, so adding an account cannot silently
      // re-authorize the one already connected. Google takes the prompt as a
      // space-delimited list.
      access_type: "offline",
      prompt: input.selectAccount ? "select_account consent" : "consent",
      include_granted_scopes: true,
      // Base scopes always; optional feature scopes (e.g. contacts) only when
      // the caller asked for them, so a plain connect URL stays byte-identical.
      scope: [...GOOGLE_SCOPES, ...(input.extraScopes ?? [])],
      state: input.state,
      ...(input.loginHint ? { login_hint: input.loginHint } : {}),
    });
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderAuthorization> {
    const client = this.#makeClient(input.redirectUri);

    let tokens: Credentials;
    try {
      ({ tokens } = await client.getToken(input.code));
    } catch (error) {
      throw new ProviderAuthError(
        "exchangeFailed",
        "Google rejected the authorization code exchange",
        { cause: redactedCause(error) },
      );
    }

    if (!tokens.refresh_token) {
      throw new ProviderAuthError(
        "missingRefreshToken",
        "Google returned no refresh token; re-consent is required",
      );
    }
    if (!tokens.id_token) {
      throw new ProviderAuthError(
        "invalidIdToken",
        "Google returned no id token to identify the account",
      );
    }

    const payload = await this.verifyIdToken(client, tokens.id_token);
    if (!payload.sub) {
      throw new ProviderAuthError(
        "missingIdentity",
        "Google id token carried no subject to identify the account",
      );
    }

    // Parse through the shared contract so the branded id and nullable-field
    // invariants hold at the boundary; empty strings normalize to null.
    const account = ProviderAccountFactsSchema.parse({
      providerAccountId: payload.sub,
      email: payload.email || null,
      displayName: payload.name || null,
    });

    return {
      account,
      refreshToken: tokens.refresh_token,
      grantedScopes: parseGrantedScopes(tokens.scope),
    };
  }

  async refreshAccessToken(input: {
    refreshToken: string;
  }): Promise<RefreshedCredential> {
    // No redirect URI: refresh is a token-endpoint call.
    const client = this.#makeClient();
    client.setCredentials({ refresh_token: input.refreshToken });

    let credentials: Credentials;
    try {
      ({ credentials } = await client.refreshAccessToken());
    } catch (error) {
      // A dead grant is not worth the job retry ladder: invalid_grant (and
      // sibling token-endpoint codes) or HTTP 400/401 mean the refresh token
      // is revoked, expired, or the client is rejected. 5xx / network stay
      // refreshFailed so a blip can recover. A 401 whose body isn't exactly
      // `invalid_grant` used to retry 20 times with the credential still
      // stored, leaving calendars stale and never prompting reconnect.
      throw new ProviderAuthError(
        isRefreshPermanentlyRejected(error)
          ? "authorizationRevoked"
          : "refreshFailed",
        "Google rejected the refresh token",
        { cause: redactedCause(error) },
      );
    }

    if (!credentials.access_token || !credentials.expiry_date) {
      throw new ProviderAuthError(
        "refreshFailed",
        "Google returned no access token or expiry on refresh",
      );
    }

    return {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date),
      grantedScopes: parseGrantedScopes(credentials.scope),
    };
  }

  async revoke(input: { token: string }): Promise<void> {
    // Best-effort: a failed revoke must not block deleting the stored
    // credential, so swallow every error. The token value is never logged.
    try {
      await this.#makeClient().revokeToken(input.token);
    } catch {
      // Intentionally ignored — the credential is removed regardless.
    }
  }

  private async verifyIdToken(
    client: GoogleOAuthClient,
    idToken: string,
  ): Promise<TokenPayload> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.#clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      throw new ProviderAuthError(
        "invalidIdToken",
        "Google id token failed verification",
        { cause: redactedCause(error) },
      );
    }
    if (!payload) {
      throw new ProviderAuthError(
        "invalidIdToken",
        "Google id token verification returned no payload",
      );
    }
    return payload;
  }
}

// Token-endpoint codes that mean the stored refresh token cannot be used
// again — reconnect is required. Reading the response (not the request) is
// leak-safe.
const PERMANENT_REFRESH_ERRORS = new Set([
  "invalid_grant",
  "unauthorized_client",
  "invalid_client",
]);

function tokenEndpointErrorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data;
  return typeof data?.error === "string" ? data.error : undefined;
}

function isRefreshPermanentlyRejected(error: unknown): boolean {
  const code = tokenEndpointErrorCode(error);
  if (code && PERMANENT_REFRESH_ERRORS.has(code)) return true;
  const status = googleStatus(error);
  return status === 400 || status === 401;
}

// Google returns granted scopes as a single space-delimited string. A subset of
// the requested scopes is normal; callers derive capabilities from what is here.
function parseGrantedScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope.split(/\s+/).filter(Boolean);
}
