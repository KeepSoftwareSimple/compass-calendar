import { faker } from "@faker-js/faker";
import { type Db } from "mongodb";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import { TEST_CREDENTIAL_ENCRYPTION_KEY } from "@sync/__tests__/helpers/credential-encryption";
import { mongoObjectId } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { CredentialCustody } from "@sync/credentials/credential-custody.service";
import { ProviderNotConfiguredError } from "@sync/providers/provider-adapters";
import {
  type ProviderAuthAdapter,
  ProviderAuthError,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type CredentialUpsert } from "@sync/storage/contracts/credential.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { randomBytes } from "node:crypto";

const objectId = () => faker.database.mongodbObjectId();

// A configurable ProviderAuthAdapter fake that counts refresh/revoke calls.
// buildAuthorizationUrl/exchangeAuthorizationCode are unused by custody.
class FakeAdapter implements ProviderAuthAdapter {
  refreshCalls = 0;
  revokedTokens: string[] = [];

  constructor(
    private readonly behavior: {
      refreshed?: RefreshedCredential;
      refreshError?: unknown;
      onRefresh?: () => Promise<void>;
    } = {},
  ) {}

  buildAuthorizationUrl(): string {
    throw new Error("not used");
  }
  exchangeAuthorizationCode(): Promise<never> {
    throw new Error("not used");
  }

  async refreshAccessToken(): Promise<RefreshedCredential> {
    this.refreshCalls += 1;
    if (this.behavior.onRefresh) await this.behavior.onRefresh();
    if (this.behavior.refreshError) throw this.behavior.refreshError;
    return (
      this.behavior.refreshed ?? {
        accessToken: "refreshed-access-token",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        grantedScopes: [],
      }
    );
  }

  async revoke(input: { token: string }): Promise<void> {
    this.revokedTokens.push(input.token);
  }
}

const baseCredential = (
  connectionId: ConnectionId,
  overrides: Partial<CredentialUpsert> = {},
): CredentialUpsert => ({
  connectionId,
  provider: "google",
  refreshToken: "stored-refresh-token",
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  ...overrides,
});

describe("CredentialCustody", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;
  let repo: CredentialRepository;

  beforeEach(() => {
    db = storage.db();
    repo = new CredentialRepository(db);
  });

  const fixedNow = () => new Date("2026-01-01T00:00:00Z");
  const makeCustody = (
    adapter: FakeAdapter,
    refreshSkewMs?: number,
  ): CredentialCustody =>
    new CredentialCustody(
      repo,
      () => adapter,
      fixedNow,
      refreshSkewMs,
      TEST_CREDENTIAL_ENCRYPTION_KEY,
    );

  it("refreshes and caches an access token when none is cached", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter({
      refreshed: {
        accessToken: "fresh-token",
        expiresAt: new Date("2026-01-01T01:00:00Z"),
        grantedScopes: [],
      },
    });
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    const token = await custody.getValidAccessToken(connectionId);

    expect(token).toBe("fresh-token");
    expect(adapter.refreshCalls).toBe(1);
    const cached = await repo.findByConnection(connectionId);
    expect(cached).toMatchObject({
      credentialKind: "oauthRefresh",
      accessToken: "fresh-token",
    });
  });

  it("serves the cached token without refreshing when it is still valid", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter();
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));
    await repo.cacheAccessToken(
      connectionId,
      "cached-token",
      new Date("2026-01-01T01:00:00Z"), // an hour ahead of fixedNow
    );

    const token = await custody.getValidAccessToken(connectionId);

    expect(token).toBe("cached-token");
    expect(adapter.refreshCalls).toBe(0);
  });

  it("refreshes on the next call after invalidateAccessToken clears the cache", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter({
      refreshed: {
        accessToken: "reminted-token",
        expiresAt: new Date("2026-01-01T01:00:00Z"),
        grantedScopes: [],
      },
    });
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));
    await repo.cacheAccessToken(
      connectionId,
      "rejected-token",
      new Date("2026-01-01T01:00:00Z"), // still unexpired by clock skew alone
    );

    await custody.invalidateAccessToken(connectionId);
    const token = await custody.getValidAccessToken(connectionId);

    expect(token).toBe("reminted-token");
    expect(adapter.refreshCalls).toBe(1);
  });

  it("refreshes when the cached token is within the expiry skew window", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter({
      refreshed: {
        accessToken: "renewed",
        expiresAt: new Date("2026-01-01T01:00:00Z"),
        grantedScopes: [],
      },
    });
    const custody = makeCustody(adapter, 60_000);
    await custody.store(baseCredential(connectionId));
    // Expires 30s after now — inside the 60s skew, so it must be refreshed.
    await repo.cacheAccessToken(
      connectionId,
      "about-to-expire",
      new Date("2026-01-01T00:00:30Z"),
    );

    const token = await custody.getValidAccessToken(connectionId);

    expect(token).toBe("renewed");
    expect(adapter.refreshCalls).toBe(1);
  });

  it("coalesces concurrent requests into a single refresh", async () => {
    const connectionId = objectId() as ConnectionId;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = new FakeAdapter({
      refreshed: {
        accessToken: "shared-token",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        grantedScopes: [],
      },
      // Hold the refresh open until both callers are queued.
      onRefresh: () => gate,
    });
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    const first = custody.getValidAccessToken(connectionId);
    const second = custody.getValidAccessToken(connectionId);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe("shared-token");
    expect(b).toBe("shared-token");
    expect(adapter.refreshCalls).toBe(1);
  });

  it("refreshes again on a later call once the in-flight refresh settled", async () => {
    const connectionId = objectId() as ConnectionId;
    // Cached token already expired, so every call must refresh.
    const adapter = new FakeAdapter({
      refreshed: {
        accessToken: "t",
        expiresAt: new Date("2026-01-01T00:00:10Z"),
        grantedScopes: [],
      },
    });
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    await custody.getValidAccessToken(connectionId);
    await custody.getValidAccessToken(connectionId);

    expect(adapter.refreshCalls).toBe(2);
  });

  it("rejects with missingRefreshToken when no credential exists", async () => {
    const adapter = new FakeAdapter();
    const custody = makeCustody(adapter);

    const error = (await custody
      .getValidAccessToken(objectId() as ConnectionId)
      .catch((e) => e)) as ProviderAuthError;

    expect(error).toBeInstanceOf(ProviderAuthError);
    expect(error.reason).toBe("missingRefreshToken");
    expect(adapter.refreshCalls).toBe(0);
  });

  it("propagates authorizationRevoked from the adapter and deletes the credential", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter({
      refreshError: new ProviderAuthError("authorizationRevoked", "revoked"),
    });
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    const error = (await custody
      .getValidAccessToken(connectionId)
      .catch((e) => e)) as ProviderAuthError;

    expect(error.reason).toBe("authorizationRevoked");
    expect(await repo.findByConnection(connectionId)).toBeNull();
    expect(adapter.revokedTokens).toEqual([]);
  });

  it("increments refreshFailureCount on a transient refresh failure", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter({
      refreshError: new ProviderAuthError("refreshFailed", "blip"),
    });
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    await expect(
      custody.getValidAccessToken(connectionId),
    ).rejects.toMatchObject({ reason: "refreshFailed" });
    const after = await repo.findByConnection(connectionId);
    expect(after).toMatchObject({
      credentialKind: "oauthRefresh",
      refreshFailureCount: 1,
    });
    expect(after).toHaveProperty("refreshTokenCiphertext");
  });

  it("discardRevoked deletes the credential and is idempotent", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter();
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    await custody.discardRevoked(connectionId);
    expect(await repo.findByConnection(connectionId)).toBeNull();

    // Second call and a never-stored connection are both no-ops.
    await custody.discardRevoked(connectionId);
    await custody.discardRevoked(objectId() as ConnectionId);
    expect(adapter.revokedTokens).toEqual([]);
  });

  it("does not serve a token when a disconnect deletes the credential mid-refresh", async () => {
    const connectionId = objectId() as ConnectionId;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Resolves once the refresh has genuinely started — which proves custody
    // already read the credential. Deleting only after this point pins the test
    // to the mid-refresh race; deleting concurrently with the initial read
    // could let the delete overtake it on a pooled connection and exercise the
    // wrong path (the plain missing-credential throw).
    let refreshStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    const adapter = new FakeAdapter({
      refreshed: {
        accessToken: "orphan-token",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        grantedScopes: [],
      },
      onRefresh: () => {
        refreshStarted();
        return gate;
      },
    });
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    // Start a refresh; the rejection handler attaches immediately so the
    // eventual rejection is never unhandled while later awaits are pending.
    const inFlight = custody
      .getValidAccessToken(connectionId)
      .catch((e) => e as ProviderAuthError);
    // Delete the credential while the refresh is in flight, then let it finish.
    await started;
    await repo.deleteByConnection(connectionId);
    release();

    const error = await inFlight;
    expect(error).toBeInstanceOf(ProviderAuthError);
    expect((error as ProviderAuthError).reason).toBe("missingRefreshToken");
    expect((error as ProviderAuthError).message).toBe(
      "Credential was removed during refresh",
    );
    // The token was never re-cached, so the deleted credential stays gone.
    expect(await repo.findByConnection(connectionId)).toBeNull();
  });

  it("stores oauth refresh tokens encrypted at rest", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter();
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    const raw = await db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(connectionId) });
    expect(raw).not.toHaveProperty("refreshToken");
    expect(raw?.refreshTokenCiphertext).toBeString();
    expect(JSON.stringify(raw)).not.toContain("stored-refresh-token");
  });

  it("re-encrypts a legacy plaintext refresh token after a successful refresh", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter({
      refreshed: {
        accessToken: "fresh-token",
        expiresAt: new Date("2026-01-01T01:00:00Z"),
        grantedScopes: [],
      },
    });
    const custody = makeCustody(adapter);
    await db.collection(SYNC_COLLECTIONS.credentials).insertOne({
      _id: mongoObjectId(connectionId),
      credentialKind: "oauthRefresh",
      provider: "google",
      refreshToken: "legacy-plaintext-token",
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshFailureCount: 0,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await custody.getValidAccessToken(connectionId);

    const raw = await db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(connectionId) });
    expect(raw).not.toHaveProperty("refreshToken");
    expect(raw?.refreshTokenCiphertext).toBeString();
    expect(JSON.stringify(raw)).not.toContain("legacy-plaintext-token");
    expect(adapter.refreshCalls).toBe(1);
  });

  it("keeps legacy plaintext credentials usable when encryption is not configured", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter({
      refreshed: {
        accessToken: "fresh-token",
        expiresAt: new Date("2026-01-01T01:00:00Z"),
        grantedScopes: [],
      },
    });
    const custody = new CredentialCustody(repo, () => adapter, fixedNow);
    await db.collection(SYNC_COLLECTIONS.credentials).insertOne({
      _id: mongoObjectId(connectionId),
      credentialKind: "oauthRefresh",
      provider: "google",
      refreshToken: "legacy-plaintext-token",
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshFailureCount: 0,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(custody.getValidAccessToken(connectionId)).resolves.toBe(
      "fresh-token",
    );

    const raw = await db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(connectionId) });
    expect(raw?.refreshToken).toBe("legacy-plaintext-token");
    expect(raw).not.toHaveProperty("refreshTokenCiphertext");
    expect(adapter.refreshCalls).toBe(1);
  });

  it("deletes the credential and revokes it on disconnect", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter();
    const custody = makeCustody(adapter);
    await custody.store(baseCredential(connectionId));

    await custody.disconnect(connectionId);

    expect(await repo.findByConnection(connectionId)).toBeNull();
    expect(adapter.revokedTokens).toEqual(["stored-refresh-token"]);
  });

  it("disconnecting an unknown connection revokes nothing and does not throw", async () => {
    const adapter = new FakeAdapter();
    const custody = makeCustody(adapter);

    await custody.disconnect(objectId() as ConnectionId);

    expect(adapter.revokedTokens).toEqual([]);
  });

  it("deletes the credential and skips revoke when the provider is not configured", async () => {
    const connectionId = objectId() as ConnectionId;
    const custody = new CredentialCustody(
      repo,
      () => {
        throw new ProviderNotConfiguredError("google");
      },
      fixedNow,
      undefined,
      TEST_CREDENTIAL_ENCRYPTION_KEY,
    );
    await custody.store(baseCredential(connectionId));

    await custody.disconnect(connectionId);

    expect(await repo.findByConnection(connectionId)).toBeNull();
  });

  it("returns a password secret without refreshing and never revokes on disconnect", async () => {
    const connectionId = objectId() as ConnectionId;
    const adapter = new FakeAdapter();
    const key = randomBytes(32).toString("base64");
    const secret = "apple-app-password-fixture";
    const custody = new CredentialCustody(
      repo,
      () => adapter,
      fixedNow,
      undefined,
      key,
    );

    await custody.storePassword(
      connectionId,
      "apple",
      "user@icloud.com",
      secret,
    );

    const token = await custody.getValidAccessToken(connectionId);
    expect(token).toBe(secret);
    expect(adapter.refreshCalls).toBe(0);

    await custody.invalidateAccessToken(connectionId);
    expect(await custody.getValidAccessToken(connectionId)).toBe(secret);
    expect(adapter.refreshCalls).toBe(0);

    const raw = await db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(connectionId) });
    expect(raw).not.toBeNull();
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(secret);
    expect(raw).not.toHaveProperty("refreshToken");
    expect(raw).toHaveProperty("secretCiphertext");

    await custody.disconnect(connectionId);
    expect(await repo.findByConnection(connectionId)).toBeNull();
    expect(adapter.revokedTokens).toEqual([]);
  });
});
