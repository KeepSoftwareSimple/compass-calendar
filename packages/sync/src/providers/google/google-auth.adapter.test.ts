import { type Credentials, type TokenPayload } from "google-auth-library";
import {
  CONTACTS_FEATURE_SCOPES,
  GOOGLE_SCOPES,
} from "@core/providers/google.scopes";
import {
  GoogleAuthAdapter,
  type GoogleOAuthClient,
} from "@sync/providers/google/google-auth.adapter";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";

// A plain fake standing in for google-auth-library's OAuth2Client. Injected via
// the adapter's client factory so no module mocking or network call is needed.
class FakeGoogleClient implements GoogleOAuthClient {
  authUrlOptions: Parameters<GoogleOAuthClient["generateAuthUrl"]>[0][] = [];
  setRefreshTokens: string[] = [];
  revokedTokens: string[] = [];

  constructor(
    private readonly behavior: {
      tokens?: Credentials;
      getTokenError?: unknown;
      payload?: TokenPayload;
      verifyError?: unknown;
      refreshCredentials?: Credentials;
      refreshError?: unknown;
      revokeError?: unknown;
    } = {},
  ) {}

  generateAuthUrl(
    options: Parameters<GoogleOAuthClient["generateAuthUrl"]>[0],
  ): string {
    this.authUrlOptions.push(options);
    const scope = encodeURIComponent(options.scope.join(" "));
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${options.state}&scope=${scope}`;
  }

  async getToken(_code: string): Promise<{ tokens: Credentials }> {
    if (this.behavior.getTokenError) throw this.behavior.getTokenError;
    return { tokens: this.behavior.tokens ?? {} };
  }

  async verifyIdToken(_options: {
    idToken: string;
    audience: string;
  }): Promise<{ getPayload(): TokenPayload | undefined }> {
    if (this.behavior.verifyError) throw this.behavior.verifyError;
    return { getPayload: () => this.behavior.payload };
  }

  setCredentials(credentials: { refresh_token: string }): void {
    this.setRefreshTokens.push(credentials.refresh_token);
  }

  async refreshAccessToken(): Promise<{ credentials: Credentials }> {
    if (this.behavior.refreshError) throw this.behavior.refreshError;
    return { credentials: this.behavior.refreshCredentials ?? {} };
  }

  async revokeToken(token: string): Promise<unknown> {
    if (this.behavior.revokeError) throw this.behavior.revokeError;
    this.revokedTokens.push(token);
    return {};
  }
}

const CLIENT_ID = "client-id.apps.googleusercontent.com";
const CLIENT_SECRET = "client-secret";

function makePayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    iat: 0,
    exp: 0,
    sub: "google-subject-123",
    email: "user@example.com",
    name: "Ada Lovelace",
    ...overrides,
  };
}

// Build an adapter whose client factory records the redirect URIs it is asked
// for and always returns the given fake.
function adapterWith(client: FakeGoogleClient) {
  const redirectUris: string[] = [];
  const adapter = new GoogleAuthAdapter(
    CLIENT_ID,
    CLIENT_SECRET,
    (redirectUri) => {
      redirectUris.push(redirectUri ?? "");
      return client;
    },
  );
  return { adapter, redirectUris };
}

describe("GoogleAuthAdapter", () => {
  it("refuses to construct without a client id and secret", () => {
    expect(() => new GoogleAuthAdapter("", CLIENT_SECRET)).toThrow(
      /client id and secret/,
    );
    expect(() => new GoogleAuthAdapter(CLIENT_ID, "")).toThrow(
      /client id and secret/,
    );
  });

  describe("buildAuthorizationUrl", () => {
    it("requests offline access and consent for every configured scope", () => {
      const client = new FakeGoogleClient();
      const { adapter, redirectUris } = adapterWith(client);

      const url = adapter.buildAuthorizationUrl({
        state: "opaque-state",
        redirectUri: "https://staging.example.com/sync/google",
      });

      // The redirect URI is passed through to the client that mints the URL.
      expect(redirectUris).toEqual(["https://staging.example.com/sync/google"]);
      const options = client.authUrlOptions[0];
      expect(options.access_type).toBe("offline");
      expect(options.prompt).toBe("consent");
      expect(options.state).toBe("opaque-state");
      expect(options.scope).toEqual([...GOOGLE_SCOPES]);
      expect(url).toContain("state=opaque-state");
    });

    it("forces the account chooser when adding an account", () => {
      const client = new FakeGoogleClient();
      const { adapter } = adapterWith(client);

      adapter.buildAuthorizationUrl({
        state: "opaque-state",
        redirectUri: "https://staging.example.com/sync/google",
        selectAccount: true,
      });

      // Without select_account, a browser signed into one Google account
      // re-authorizes that same account and the user never gets to pick.
      // consent must stay so the exchange still returns a refresh token.
      expect(client.authUrlOptions[0].prompt).toBe("select_account consent");
      expect(client.authUrlOptions[0].access_type).toBe("offline");
    });

    it("appends optional feature scopes after the base scopes", () => {
      const client = new FakeGoogleClient();
      const { adapter } = adapterWith(client);

      adapter.buildAuthorizationUrl({
        state: "opaque-state",
        redirectUri: "https://staging.example.com/sync/google",
        extraScopes: CONTACTS_FEATURE_SCOPES,
      });

      expect(client.authUrlOptions[0].scope).toEqual([
        ...GOOGLE_SCOPES,
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/contacts.other.readonly",
      ]);
    });

    it("builds a byte-identical consent URL when no extra scopes are asked for", () => {
      const client = new FakeGoogleClient();
      const { adapter } = adapterWith(client);

      const withoutField = adapter.buildAuthorizationUrl({
        state: "opaque-state",
        redirectUri: "https://staging.example.com/sync/google",
      });
      const emptyList = adapter.buildAuthorizationUrl({
        state: "opaque-state",
        redirectUri: "https://staging.example.com/sync/google",
        extraScopes: [],
      });

      // The optional-scope rollout must not change what a plain connect asks
      // Google for — same URL, base scopes only.
      expect(emptyList).toBe(withoutField);
      expect(client.authUrlOptions[0].scope).toEqual([...GOOGLE_SCOPES]);
      expect(client.authUrlOptions[1].scope).toEqual([...GOOGLE_SCOPES]);
    });
  });

  describe("exchangeAuthorizationCode", () => {
    const validTokens: Credentials = {
      refresh_token: "refresh-token-value",
      access_token: "access-token-value",
      id_token: "id-token-value",
      scope:
        "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.readonly",
    };

    it("returns sub-keyed identity, the refresh token, and granted scopes", async () => {
      const client = new FakeGoogleClient({
        tokens: validTokens,
        payload: makePayload(),
      });
      const { adapter, redirectUris } = adapterWith(client);

      const result = await adapter.exchangeAuthorizationCode({
        code: "auth-code",
        redirectUri: "https://staging.example.com/sync/google",
      });

      expect(result.account.providerAccountId).toBe("google-subject-123");
      expect(result.account.email).toBe("user@example.com");
      expect(result.account.displayName).toBe("Ada Lovelace");
      expect(result.refreshToken).toBe("refresh-token-value");
      expect(result.grantedScopes).toEqual([
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/calendar.readonly",
      ]);
      expect(redirectUris).toEqual(["https://staging.example.com/sync/google"]);
    });

    it("preserves identity when the account email changes (keyed on sub)", async () => {
      const first = await adapterWith(
        new FakeGoogleClient({ tokens: validTokens, payload: makePayload() }),
      ).adapter.exchangeAuthorizationCode({
        code: "code-1",
        redirectUri: "https://x/sync/google",
      });

      const second = await adapterWith(
        new FakeGoogleClient({
          tokens: { ...validTokens, refresh_token: "rotated-refresh" },
          payload: makePayload({ email: "renamed@example.com" }),
        }),
      ).adapter.exchangeAuthorizationCode({
        code: "code-2",
        redirectUri: "https://x/sync/google",
      });

      // Same Google account -> same stable id, even though email + token moved.
      expect(second.account.providerAccountId).toBe(
        first.account.providerAccountId,
      );
      expect(second.account.email).toBe("renamed@example.com");
      expect(second.refreshToken).toBe("rotated-refresh");
    });

    it("normalizes an absent email or name to null", async () => {
      const client = new FakeGoogleClient({
        tokens: validTokens,
        payload: makePayload({ email: undefined, name: undefined }),
      });
      const { adapter } = adapterWith(client);

      const result = await adapter.exchangeAuthorizationCode({
        code: "auth-code",
        redirectUri: "https://x/sync/google",
      });

      expect(result.account.providerAccountId).toBe("google-subject-123");
      expect(result.account.email).toBeNull();
      expect(result.account.displayName).toBeNull();
    });

    it("treats a failed code exchange as exchangeFailed", async () => {
      const client = new FakeGoogleClient({
        getTokenError: new Error("invalid_grant"),
      });
      const { adapter } = adapterWith(client);

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "bad-code",
          redirectUri: "https://x/sync/google",
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ProviderAuthError);
      expect((error as ProviderAuthError).reason).toBe("exchangeFailed");
    });

    it("does not propagate the raw exchange error (which carries the client secret)", async () => {
      // google-auth-library/gaxios errors retain the token-exchange request
      // config, which includes the app's client_secret and the auth code.
      const leaky = Object.assign(new Error("invalid_grant"), {
        config: { data: "client_secret=SUPER_SECRET&code=auth-code" },
        response: { data: { error: "invalid_grant" } },
      });
      const client = new FakeGoogleClient({ getTokenError: leaky });
      const { adapter } = adapterWith(client);

      const error = (await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://x/sync/google",
        })
        .catch((e) => e)) as ProviderAuthError;

      const cause = error.cause as Error & { config?: unknown };
      // The reason and a safe message survive; the raw object does not.
      expect(cause).toBeInstanceOf(Error);
      expect(cause.message).toBe("invalid_grant");
      expect(cause).not.toBe(leaky);
      expect(cause.config).toBeUndefined();
      // Nothing reachable from the error may serialize the secret.
      expect(
        JSON.stringify({ message: error.message, cause: cause.message }),
      ).not.toContain("SUPER_SECRET");
    });

    it("requires a refresh token", async () => {
      const client = new FakeGoogleClient({
        tokens: { ...validTokens, refresh_token: undefined },
        payload: makePayload(),
      });
      const { adapter } = adapterWith(client);

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://x/sync/google",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("missingRefreshToken");
    });

    it("requires an id token to identify the account", async () => {
      const client = new FakeGoogleClient({
        tokens: { ...validTokens, id_token: undefined },
        payload: makePayload(),
      });
      const { adapter } = adapterWith(client);

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://x/sync/google",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("invalidIdToken");
    });

    it("treats a failed id-token verification as invalidIdToken", async () => {
      const client = new FakeGoogleClient({
        tokens: validTokens,
        verifyError: new Error("Wrong recipient"),
      });
      const { adapter } = adapterWith(client);

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://x/sync/google",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("invalidIdToken");
    });

    it("rejects a verified token that carries no subject", async () => {
      const client = new FakeGoogleClient({
        tokens: validTokens,
        payload: makePayload({ sub: "" }),
      });
      const { adapter } = adapterWith(client);

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://x/sync/google",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("missingIdentity");
    });

    it("returns no granted scopes when the provider omits them", async () => {
      const client = new FakeGoogleClient({
        tokens: { ...validTokens, scope: undefined },
        payload: makePayload(),
      });
      const { adapter } = adapterWith(client);

      const result = await adapter.exchangeAuthorizationCode({
        code: "auth-code",
        redirectUri: "https://x/sync/google",
      });

      expect(result.grantedScopes).toEqual([]);
    });
  });

  describe("refreshAccessToken", () => {
    it("mints a fresh access token, expiry, and scopes from the refresh token", async () => {
      const expiryMs = 1_900_000_000_000;
      const client = new FakeGoogleClient({
        refreshCredentials: {
          access_token: "fresh-access-token",
          expiry_date: expiryMs,
          scope: "https://www.googleapis.com/auth/calendar.events",
        },
      });
      const { adapter } = adapterWith(client);

      const result = await adapter.refreshAccessToken({
        refreshToken: "stored-refresh-token",
      });

      // The refresh token is applied to the client before refreshing.
      expect(client.setRefreshTokens).toEqual(["stored-refresh-token"]);
      expect(result.accessToken).toBe("fresh-access-token");
      expect(result.expiresAt).toEqual(new Date(expiryMs));
      expect(result.grantedScopes).toEqual([
        "https://www.googleapis.com/auth/calendar.events",
      ]);
    });

    it("classifies an invalid_grant as authorizationRevoked", async () => {
      const client = new FakeGoogleClient({
        refreshError: { response: { data: { error: "invalid_grant" } } },
      });
      const { adapter } = adapterWith(client);

      const error = (await adapter
        .refreshAccessToken({ refreshToken: "revoked" })
        .catch((e) => e)) as ProviderAuthError;

      expect(error).toBeInstanceOf(ProviderAuthError);
      expect(error.reason).toBe("authorizationRevoked");
    });

    it.each([
      "unauthorized_client",
      "invalid_client",
    ] as const)("classifies %s as authorizationRevoked", async (code) => {
      const client = new FakeGoogleClient({
        refreshError: { response: { data: { error: code } } },
      });
      const { adapter } = adapterWith(client);

      const error = (await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e)) as ProviderAuthError;

      expect(error.reason).toBe("authorizationRevoked");
    });

    it("classifies an HTTP 401 refresh rejection as authorizationRevoked even without invalid_grant", async () => {
      const client = new FakeGoogleClient({
        refreshError: { response: { status: 401 } },
      });
      const { adapter } = adapterWith(client);

      const error = (await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e)) as ProviderAuthError;

      expect(error.reason).toBe("authorizationRevoked");
    });

    it("classifies an HTTP 400 refresh rejection as authorizationRevoked", async () => {
      const client = new FakeGoogleClient({
        refreshError: { response: { status: 400 } },
      });
      const { adapter } = adapterWith(client);

      const error = (await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e)) as ProviderAuthError;

      expect(error.reason).toBe("authorizationRevoked");
    });

    it("classifies any other refresh error as refreshFailed", async () => {
      const client = new FakeGoogleClient({
        refreshError: {
          response: { data: { error: "temporarily_unavailable" } },
        },
      });
      const { adapter } = adapterWith(client);

      const error = (await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e)) as ProviderAuthError;

      expect(error.reason).toBe("refreshFailed");
    });

    it("fails when the provider returns no access token or expiry", async () => {
      const client = new FakeGoogleClient({
        refreshCredentials: { access_token: "tok" }, // no expiry_date
      });
      const { adapter } = adapterWith(client);

      const error = (await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e)) as ProviderAuthError;

      expect(error.reason).toBe("refreshFailed");
    });

    it("does not propagate the raw refresh error (which can carry the secret)", async () => {
      const leaky = Object.assign(new Error("invalid_grant"), {
        config: { data: "client_secret=SUPER_SECRET&refresh_token=rt" },
        response: { data: { error: "invalid_grant" } },
      });
      const client = new FakeGoogleClient({ refreshError: leaky });
      const { adapter } = adapterWith(client);

      const error = (await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e)) as ProviderAuthError;

      const cause = error.cause as Error & { config?: unknown };
      expect(cause).toBeInstanceOf(Error);
      expect(cause).not.toBe(leaky);
      expect(cause.config).toBeUndefined();
      expect(JSON.stringify({ cause: cause.message })).not.toContain(
        "SUPER_SECRET",
      );
    });
  });

  describe("revoke", () => {
    it("revokes the token at the provider", async () => {
      const client = new FakeGoogleClient();
      const { adapter } = adapterWith(client);

      await adapter.revoke({ token: "token-to-revoke" });

      expect(client.revokedTokens).toEqual(["token-to-revoke"]);
    });

    it("never throws when revocation fails (best effort)", async () => {
      const client = new FakeGoogleClient({
        revokeError: new Error("revoke endpoint down"),
      });
      const { adapter } = adapterWith(client);

      // Must resolve, not reject — a failed revoke can't block a disconnect.
      await expect(adapter.revoke({ token: "token" })).resolves.toBeUndefined();
    });
  });
});
