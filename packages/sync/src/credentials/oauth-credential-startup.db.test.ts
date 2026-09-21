import { faker } from "@faker-js/faker";
import { type Db, type Document } from "mongodb";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import {
  TEST_CREDENTIAL_ENCRYPTION_KEY,
  toStoredOauthCredentialUpsert,
} from "@sync/__tests__/helpers/credential-encryption";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  assertOauthCredentialStartupReady,
  countPlaintextOauthRefreshCredentials,
  PLAINTEXT_OAUTH_BOOT_MESSAGE,
} from "@sync/credentials/oauth-credential-startup";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type CredentialUpsert } from "@sync/storage/contracts/credential.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";

const objectId = () => faker.database.mongodbObjectId();

describe("oauth credential startup guard", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;

  beforeEach(() => {
    db = storage.db();
  });

  it("passes when no credentials exist", async () => {
    await expect(
      assertOauthCredentialStartupReady(db, undefined),
    ).resolves.toBeUndefined();
  });

  it("passes when only encrypted oauth credentials exist and the key is set", async () => {
    const repo = new CredentialRepository(db);
    const input: CredentialUpsert = {
      connectionId: objectId() as ConnectionId,
      provider: "google",
      refreshToken: "refresh-token-secret",
      scopes: [],
    };
    await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, input),
    );

    await expect(
      assertOauthCredentialStartupReady(db, TEST_CREDENTIAL_ENCRYPTION_KEY),
    ).resolves.toBeUndefined();
  });

  it("fails startup when a plaintext oauth row remains", async () => {
    await db.collection(SYNC_COLLECTIONS.credentials).insertOne({
      _id: objectId(),
      credentialKind: "oauthRefresh",
      provider: "google",
      refreshToken: "legacy-plaintext-token",
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshFailureCount: 0,
      scopes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Document);

    expect(await countPlaintextOauthRefreshCredentials(db)).toBe(1);
    await expect(
      assertOauthCredentialStartupReady(db, undefined),
    ).rejects.toThrow(PLAINTEXT_OAUTH_BOOT_MESSAGE);
  });

  it("requires the encryption key when stored oauth credentials exist", async () => {
    const repo = new CredentialRepository(db);
    const input: CredentialUpsert = {
      connectionId: objectId() as ConnectionId,
      provider: "google",
      refreshToken: "refresh-token-secret",
      scopes: [],
    };
    await repo.store(
      toStoredOauthCredentialUpsert(TEST_CREDENTIAL_ENCRYPTION_KEY, input),
    );

    await expect(
      assertOauthCredentialStartupReady(db, undefined),
    ).rejects.toThrow(
      "stored credentials require sync.credentialEncryptionKey",
    );
  });
});
