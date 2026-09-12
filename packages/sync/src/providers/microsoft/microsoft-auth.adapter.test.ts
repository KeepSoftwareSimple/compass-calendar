import { generateKeyPair, type KeyLike, SignJWT } from "jose";
import {
  CONTACTS_FEATURE_SCOPES,
  MICROSOFT_SCOPES,
} from "@core/providers/microsoft.scopes";
import { type ProviderAccountId } from "@core/types/sync/identity.contracts";
import {
  MICROSOFT_AUTHORIZE_URL,
  MicrosoftAuthAdapter,
  type MicrosoftIdTokenClaims,
  type MicrosoftIdTokenVerifier,
  type MicrosoftTokenEndpoint,
  type MicrosoftTokenResponse,
} from "@sync/providers/microsoft/microsoft-auth.adapter";
import { isMicrosoftConsentRequired } from "@sync/providers/microsoft/microsoft-consent";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";

type ExchangeInput = Parameters<
  MicrosoftTokenEndpoint["exchangeAuthorizationCode"]
>[0];
type RefreshInput = Parameters<MicrosoftTokenEndpoint["refreshAccessToken"]>[0];

class FakeTokenEndpoint implements MicrosoftTokenEndpoint {
  exchangeInputs: ExchangeInput[] = [];
  refreshInputs: RefreshInput[] = [];

  constructor(
    private readonly behavior: {
      exchangeResponse?: MicrosoftTokenResponse;
      exchangeError?: unknown;
      refreshResponse?: MicrosoftTokenResponse;
      refreshError?: unknown;
    } = {},
  ) {}

  exchangeAuthorizationCode(
    input: ExchangeInput,
  ): Promise<MicrosoftTokenResponse> {
    this.exchangeInputs.push(input);
    if (this.behavior.exchangeError) {
      return Promise.reject(this.behavior.exchangeError);
    }
    return Promise.resolve(this.behavior.exchangeResponse ?? {});
  }

  refreshAccessToken(input: RefreshInput): Promise<MicrosoftTokenResponse> {
    this.refreshInputs.push(input);
    if (this.behavior.refreshError) {
      return Promise.reject(this.behavior.refreshError);
    }
    return Promise.resolve(this.behavior.refreshResponse ?? {});
  }
}

class FakeIdTokenVerifier implements MicrosoftIdTokenVerifier {
  verifyCalls: Array<{ idToken: string; audience: string }> = [];

  constructor(
    private readonly behavior: {
      claims?: MicrosoftIdTokenClaims;
      verifyError?: unknown;
    } = {},
  ) {}

  verify(idToken: string, audience: string): Promise<MicrosoftIdTokenClaims> {
    this.verifyCalls.push({ idToken, audience });
    if (this.behavior.verifyError) {
      return Promise.reject(this.behavior.verifyError);
    }
    return Promise.resolve(this.behavior.claims ?? {});
  }
}

const CLIENT_ID = "microsoft-client-id";
const CLIENT_SECRET = "microsoft-client-secret";

function makeClaims(
  overrides: Partial<MicrosoftIdTokenClaims> = {},
): MicrosoftIdTokenClaims {
  return {
    oid: "microsoft-oid-123",
    preferred_username: "user@contoso.com",
    name: "Contoso User",
    ...overrides,
  };
}

function adapterWith(
  tokenEndpoint: FakeTokenEndpoint,
  idVerifier: FakeIdTokenVerifier,
) {
  return new MicrosoftAuthAdapter(
    CLIENT_ID,
    CLIENT_SECRET,
    () => tokenEndpoint,
    () => idVerifier,
  );
}

async function signedIdToken(
  privateKey: KeyLike,
  claims: MicrosoftIdTokenClaims,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(privateKey);
}

describe("isMicrosoftConsentRequired", () => {
  it.each([
    "consent_required",
    "interaction_required",
  ] as const)("detects %s", (error) => {
    expect(isMicrosoftConsentRequired(error)).toBe(true);
  });

  it("detects AADSTS65001 in the description", () => {
    expect(
      isMicrosoftConsentRequired(
        "invalid_grant",
        "AADSTS65001: The user or administrator has not consented",
      ),
    ).toBe(true);
  });
});

describe("MicrosoftAuthAdapter", () => {
  it("refuses to construct without a client id and secret", () => {
    expect(() => new MicrosoftAuthAdapter("", CLIENT_SECRET)).toThrow(
      /client id and secret/,
    );
    expect(() => new MicrosoftAuthAdapter(CLIENT_ID, "")).toThrow(
      /client id and secret/,
    );
  });

  describe("buildAuthorizationUrl", () => {
    it("builds the /common authorize URL with the base scopes", () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint(),
        new FakeIdTokenVerifier(),
      );

      const url = new URL(
        adapter.buildAuthorizationUrl({
          state: "opaque-state",
          redirectUri: "https://staging.example.com/sync/microsoft",
        }),
      );

      expect(url.origin + url.pathname).toBe(MICROSOFT_AUTHORIZE_URL);
      expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("response_mode")).toBe("query");
      expect(url.searchParams.get("state")).toBe("opaque-state");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://staging.example.com/sync/microsoft",
      );
      expect(url.searchParams.get("prompt")).toBe("consent");
      expect(url.searchParams.get("scope")?.split(" ")).toEqual([
        ...MICROSOFT_SCOPES,
      ]);
    });

    it("forces the account chooser when adding an account", () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint(),
        new FakeIdTokenVerifier(),
      );

      const url = new URL(
        adapter.buildAuthorizationUrl({
          state: "opaque-state",
          redirectUri: "https://staging.example.com/sync/microsoft",
          selectAccount: true,
        }),
      );

      // Microsoft rejects combined prompt values (AADSTS90023). A second
      // account needs the chooser only; first-connection consent already granted
      // offline_access, and a missing refresh token re-runs with consent.
      expect(url.searchParams.get("prompt")).toBe("select_account");
    });

    it("never sends a space-separated prompt value", () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint(),
        new FakeIdTokenVerifier(),
      );

      const absent = new URL(
        adapter.buildAuthorizationUrl({
          state: "opaque-state",
          redirectUri: "https://staging.example.com/sync/microsoft",
        }),
      );
      const explicitFalse = new URL(
        adapter.buildAuthorizationUrl({
          state: "opaque-state",
          redirectUri: "https://staging.example.com/sync/microsoft",
          selectAccount: false,
        }),
      );
      const selectAccount = new URL(
        adapter.buildAuthorizationUrl({
          state: "opaque-state",
          redirectUri: "https://staging.example.com/sync/microsoft",
          selectAccount: true,
        }),
      );

      expect(absent.searchParams.get("prompt")).toBe("consent");
      expect(explicitFalse.searchParams.get("prompt")).toBe("consent");
      expect(selectAccount.searchParams.get("prompt")).toBe("select_account");
      for (const url of [absent, explicitFalse, selectAccount]) {
        expect(url.searchParams.get("prompt")).not.toMatch(/\s/);
      }
    });

    it("passes login_hint on reconnect so the same account is pre-selected", () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint(),
        new FakeIdTokenVerifier(),
      );

      const url = new URL(
        adapter.buildAuthorizationUrl({
          state: "opaque-state",
          redirectUri: "https://staging.example.com/sync/microsoft",
          loginHint: "ada@contoso.com",
        }),
      );

      expect(url.searchParams.get("login_hint")).toBe("ada@contoso.com");
      expect(url.searchParams.get("prompt")).toBe("consent");
    });

    it("appends optional feature scopes after the base scopes", () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint(),
        new FakeIdTokenVerifier(),
      );

      const url = new URL(
        adapter.buildAuthorizationUrl({
          state: "opaque-state",
          redirectUri: "https://staging.example.com/sync/microsoft",
          extraScopes: CONTACTS_FEATURE_SCOPES,
        }),
      );

      expect(url.searchParams.get("scope")?.split(" ")).toEqual([
        ...MICROSOFT_SCOPES,
        "People.Read",
      ]);
    });
  });

  describe("exchangeAuthorizationCode", () => {
    const validExchange: MicrosoftTokenResponse = {
      refresh_token: "refresh-token-value",
      access_token: "access-token-value",
      id_token: "id-token-value",
      scope:
        "openid profile email offline_access User.Read Calendars.ReadWrite",
    };

    it("returns oid-keyed identity, the refresh token, and granted scopes with a signed id token", async () => {
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const claims = makeClaims();
      const idToken = await signedIdToken(privateKey, claims);
      const tokenEndpoint = new FakeTokenEndpoint({
        exchangeResponse: { ...validExchange, id_token: idToken },
      });
      const idVerifier = new FakeIdTokenVerifier({ claims: makeClaims() });
      const adapter = new MicrosoftAuthAdapter(
        CLIENT_ID,
        CLIENT_SECRET,
        () => tokenEndpoint,
        () => idVerifier,
      );

      const result = await adapter.exchangeAuthorizationCode({
        code: "auth-code",
        redirectUri: "https://staging.example.com/sync/microsoft",
      });

      expect(result.account.providerAccountId).toBe(
        "microsoft-oid-123" as ProviderAccountId,
      );
      expect(result.account.email).toBe("user@contoso.com");
      expect(result.account.displayName).toBe("Contoso User");
      expect(result.refreshToken).toBe("refresh-token-value");
      expect(result.grantedScopes).toEqual([
        "openid",
        "profile",
        "email",
        "offline_access",
        "User.Read",
        "Calendars.ReadWrite",
      ]);
      expect(tokenEndpoint.exchangeInputs[0]?.redirectUri).toBe(
        "https://staging.example.com/sync/microsoft",
      );
      expect(idVerifier.verifyCalls).toHaveLength(1);
      expect(publicKey).toBeDefined();
    });

    it("falls back to email when preferred_username is absent", async () => {
      const tokenEndpoint = new FakeTokenEndpoint({
        exchangeResponse: validExchange,
      });
      const adapter = adapterWith(
        tokenEndpoint,
        new FakeIdTokenVerifier({
          claims: makeClaims({
            preferred_username: undefined,
            email: "fallback@contoso.com",
          }),
        }),
      );

      const result = await adapter.exchangeAuthorizationCode({
        code: "auth-code",
        redirectUri: "https://staging.example.com/sync/microsoft",
      });

      expect(result.account.email).toBe("fallback@contoso.com");
    });

    it("maps admin-consent errors to consentRequired", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          exchangeResponse: {
            error: "invalid_grant",
            error_description: "AADSTS65001: Admin consent required",
          },
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ProviderAuthError);
      expect((error as ProviderAuthError).reason).toBe("consentRequired");
    });

    it.each([
      "consent_required",
      "interaction_required",
    ] as const)("maps %s to consentRequired", async (oauthError) => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          exchangeResponse: { error: oauthError },
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("consentRequired");
    });

    it("treats a failed code exchange as exchangeFailed", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({ exchangeError: new Error("network down") }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "bad-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("exchangeFailed");
      // The thrown cause is what tells a network fault from a rejection.
      expect((error as ProviderAuthError).message).toBe(
        "Microsoft rejected the authorization code exchange (network down)",
      );
    });

    // Staging logged "rejected the authorization code exchange" three times
    // in thirty seconds with nothing to say why. The OAuth error code and
    // the AADSTS sentence are the diagnosis; the rest of Entra's description
    // is a per-request trace id and timestamp that would split PostHog's
    // grouping into one issue per attempt, so only the first sentence goes.
    it("names the OAuth error and its first sentence on a rejected exchange", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          exchangeResponse: {
            error: "invalid_client",
            error_description:
              "AADSTS7000215: Invalid client secret provided. Trace ID: 1234 Correlation ID: 5678 Timestamp: 2026-09-11 01:14:28Z",
          },
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("exchangeFailed");
      expect((error as ProviderAuthError).message).toBe(
        "Microsoft rejected the authorization code exchange (invalid_client: AADSTS7000215: Invalid client secret provided)",
      );
    });

    it("reports the HTTP status when the token endpoint answered without an OAuth error", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          exchangeError: Object.assign(new Error("token_endpoint_error"), {
            response: { status: 502, data: {} },
          }),
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).message).toBe(
        "Microsoft rejected the authorization code exchange (status 502)",
      );
    });

    it("requires a refresh token", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          exchangeResponse: { ...validExchange, refresh_token: undefined },
        }),
        new FakeIdTokenVerifier({ claims: makeClaims() }),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("missingRefreshToken");
    });

    it("requires an id token to identify the account", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          exchangeResponse: { ...validExchange, id_token: undefined },
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("invalidIdToken");
    });

    it("treats a failed id-token verification as invalidIdToken", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({ exchangeResponse: validExchange }),
        new FakeIdTokenVerifier({ verifyError: new Error("bad signature") }),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("invalidIdToken");
    });

    it("rejects a verified token that carries no oid", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({ exchangeResponse: validExchange }),
        new FakeIdTokenVerifier({ claims: makeClaims({ oid: undefined }) }),
      );

      const error = await adapter
        .exchangeAuthorizationCode({
          code: "auth-code",
          redirectUri: "https://staging.example.com/sync/microsoft",
        })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("missingIdentity");
    });
  });

  describe("refreshAccessToken", () => {
    it("mints a fresh access token, expiry, and scopes from the refresh token", async () => {
      const tokenEndpoint = new FakeTokenEndpoint({
        refreshResponse: {
          access_token: "fresh-access-token",
          expires_in: 3600,
          scope: "Calendars.ReadWrite User.Read",
        },
      });
      const adapter = adapterWith(tokenEndpoint, new FakeIdTokenVerifier());

      const result = await adapter.refreshAccessToken({
        refreshToken: "stored-refresh-token",
      });

      expect(tokenEndpoint.refreshInputs[0]?.refreshToken).toBe(
        "stored-refresh-token",
      );
      expect(result.accessToken).toBe("fresh-access-token");
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(result.grantedScopes).toEqual([
        "Calendars.ReadWrite",
        "User.Read",
      ]);
    });

    it("classifies invalid_grant as authorizationRevoked", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          refreshResponse: {
            error: "invalid_grant",
            error_description: "The refresh token has expired",
          },
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .refreshAccessToken({ refreshToken: "revoked" })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("authorizationRevoked");
    });

    it("classifies HTTP 503 refresh failures as refreshFailed", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          refreshError: { response: { status: 503 } },
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("refreshFailed");
    });

    it("maps admin-consent refresh errors to consentRequired", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          refreshResponse: {
            error: "interaction_required",
          },
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("consentRequired");
    });

    it("fails when the provider returns no access token or expiry", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint({
          refreshResponse: { access_token: "tok" },
        }),
        new FakeIdTokenVerifier(),
      );

      const error = await adapter
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((e) => e);

      expect((error as ProviderAuthError).reason).toBe("refreshFailed");
    });
  });

  describe("revoke", () => {
    it("never throws because Microsoft has no revocation endpoint", async () => {
      const adapter = adapterWith(
        new FakeTokenEndpoint(),
        new FakeIdTokenVerifier(),
      );

      await expect(adapter.revoke({ token: "token" })).resolves.toBeUndefined();
    });
  });
});
