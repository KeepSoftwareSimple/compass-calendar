import { faker } from "@faker-js/faker";
import { type Db } from "mongodb";
import { decryptCredentialAtRest } from "@core/security/credential-at-rest";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import {
  TEST_CREDENTIAL_ENCRYPTION_KEY,
  toStoredOauthCredentialUpsert,
} from "@sync/__tests__/helpers/credential-encryption";
import { mongoObjectId } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  type CredentialUpsert,
  redactCredential,
} from "@sync/storage/contracts/credential.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";

const objectId = () => faker.database.mongodbObjectId();

const baseCredential = (
  overrides: Partial<CredentialUpsert> = {},
): CredentialUpsert => ({
  connectionId: objectId() as ConnectionId,
  provider: "google",
  refreshToken: "refresh-token-secret",
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  ...overrides,
});

describe("CredentialRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;
  let repo: CredentialRepository;

  beforeEach(() => {
    db = storage.db();
    repo = new CredentialRepository(db);
  });

  it("stores and reads back a credential keyed by connection id", async () => {
    const input = baseCredential();
    const stored = await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, input),
    );

    expect(stored._id).toBe(input.connectionId);
    expect(stored.refreshTokenCiphertext).toBeString();
    expect(stored.accessToken).toBeNull();
    expect(stored.createdAt).toBeInstanceOf(Date);

    const read = await repo.findByConnection(input.connectionId);
    expect(read).toMatchObject({
      credentialKind: "oauthRefresh",
      refreshTokenCiphertext: stored.refreshTokenCiphertext,
    });

    const raw = await db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(input.connectionId) });
    expect(raw).not.toHaveProperty("refreshToken");
    expect(JSON.stringify(raw)).not.toContain("refresh-token-secret");
  });

  it("returns null when no credential exists for the connection", async () => {
    expect(await repo.findByConnection(objectId() as ConnectionId)).toBeNull();
  });

  it("caches an access token and clears it when a new refresh token is stored", async () => {
    const input = baseCredential();
    await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, input),
    );

    const expiresAt = new Date(Date.now() + 3600_000);
    const cached = await repo.cacheAccessToken(
      input.connectionId,
      "access-token-value",
      expiresAt,
    );
    expect(cached?.accessToken).toBe("access-token-value");
    expect(cached?.accessTokenExpiresAt).toEqual(expiresAt);

    const reAuthed = await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, {
        ...input,
        refreshToken: "rotated-refresh-token",
      }),
    );
    expect(reAuthed.refreshTokenCiphertext).toBeString();
    expect(reAuthed.accessToken).toBeNull();
    expect(reAuthed.accessTokenExpiresAt).toBeNull();
  });

  it("reencrypts a legacy plaintext refresh token", async () => {
    const input = baseCredential();
    await db.collection(SYNC_COLLECTIONS.credentials).insertOne({
      _id: mongoObjectId(input.connectionId),
      credentialKind: "oauthRefresh",
      provider: input.provider,
      refreshToken: input.refreshToken,
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshFailureCount: 0,
      scopes: input.scopes,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sealed = toStoredOauthCredentialUpsert(
      TEST_CREDENTIAL_ENCRYPTION_KEY,
      input,
    );
    const updated = await repo.reencryptOauthRefresh(input.connectionId, {
      refreshTokenCiphertext: sealed.refreshTokenCiphertext,
      refreshTokenIv: sealed.refreshTokenIv,
      refreshTokenTag: sealed.refreshTokenTag,
      keyVersion: sealed.keyVersion,
    });

    expect(updated?.refreshTokenCiphertext).toBe(sealed.refreshTokenCiphertext);
    const raw = await db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(input.connectionId) });
    expect(raw).not.toHaveProperty("refreshToken");
    expect(
      decryptCredentialAtRest(TEST_CREDENTIAL_ENCRYPTION_KEY, {
        ciphertext: String(raw?.refreshTokenCiphertext),
        iv: String(raw?.refreshTokenIv),
        tag: String(raw?.refreshTokenTag),
        keyVersion: Number(raw?.keyVersion),
      }),
    ).toBe("refresh-token-secret");
  });

  it("does not resurrect a credential that was deleted mid-refresh", async () => {
    const input = baseCredential();
    await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, input),
    );
    await repo.deleteByConnection(input.connectionId);

    const result = await repo.cacheAccessToken(
      input.connectionId,
      "access-token-value",
      new Date(Date.now() + 3600_000),
    );
    expect(result).toBeNull();
    expect(await repo.findByConnection(input.connectionId)).toBeNull();
  });

  it("reports whether a delete removed anything", async () => {
    const input = baseCredential();
    await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, input),
    );

    expect(await repo.deleteByConnection(input.connectionId)).toBe(true);
    expect(await repo.deleteByConnection(input.connectionId)).toBe(false);
  });

  it("keeps credentials out of the provider_connections collection", async () => {
    const input = baseCredential();
    await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, input),
    );

    const inConnections = await db
      .collection(SYNC_COLLECTIONS.providerConnections)
      .findOne({ _id: mongoObjectId(input.connectionId) });
    expect(inConnections).toBeNull();

    const inCredentials = await db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(input.connectionId) });
    expect(inCredentials).not.toBeNull();
  });

  it("redacts token-shaped fields for logging", async () => {
    const input = baseCredential();
    const stored = await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, input),
    );
    await repo.cacheAccessToken(
      stored._id,
      "access-token-value",
      new Date(Date.now() + 3600_000),
    );
    const record = await repo.findByConnection(stored._id);
    const redacted = redactCredential(record!);

    expect(redacted.hasRefreshToken).toBe(true);
    expect(redacted.hasAccessToken).toBe(true);
    expect(redacted.scopeCount).toBe(1);
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("refresh-token-secret");
    expect(serialized).not.toContain("access-token-value");
  });

  it("parses a document stored without credentialKind as oauthRefresh", async () => {
    const connectionId = objectId() as ConnectionId;
    await db.collection(SYNC_COLLECTIONS.credentials).insertOne({
      _id: mongoObjectId(connectionId),
      provider: "google",
      refreshToken: "legacy-refresh",
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshFailureCount: 0,
      scopes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const read = await repo.findByConnection(connectionId);
    expect(read).toMatchObject({
      credentialKind: "oauthRefresh",
      refreshToken: "legacy-refresh",
    });
  });

  it("stores a password credential without mixing oauth fields", async () => {
    const connectionId = objectId() as ConnectionId;
    const stored = await repo.storePassword({
      connectionId,
      provider: "apple",
      username: "user@icloud.com",
      secretCiphertext: "cipher",
      secretIv: "iv",
      secretTag: "tag",
      keyVersion: 1,
    });
    expect(stored.credentialKind).toBe("password");
    expect(stored.username).toBe("user@icloud.com");

    expect(
      await repo.cacheAccessToken(connectionId, "should-not-write", new Date()),
    ).toBeNull();
    expect(await repo.incrementRefreshFailure(connectionId)).toBe(0);

    const raw = await db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(connectionId) });
    expect(raw).not.toHaveProperty("refreshToken");
    expect(raw).not.toHaveProperty("accessToken");
  });
});
