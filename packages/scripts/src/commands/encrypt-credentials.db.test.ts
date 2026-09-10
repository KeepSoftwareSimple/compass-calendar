import { faker } from "@faker-js/faker";
import { encryptCredentials } from "@scripts/commands/encrypt-credentials/backfill";
import { decryptCredentialAtRest } from "@core/security/credential-at-rest";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import { mongoObjectId } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";

const objectId = () => faker.database.mongodbObjectId();

const KEY = randomBytes(32).toString("base64");
const NOW = new Date("2026-09-04T12:00:00.000Z");

describe("encrypt-credentials (db)", () => {
  const storage = setupSyncStorage(import.meta.url);

  it("dry-run reports matches without writing", async () => {
    const connectionId = objectId() as ConnectionId;
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.credentials)
      .insertOne({
        _id: mongoObjectId(connectionId),
        credentialKind: "oauthRefresh",
        provider: "google",
        refreshToken: "legacy-token",
        accessToken: null,
        accessTokenExpiresAt: null,
        refreshFailureCount: 0,
        scopes: [],
        createdAt: NOW,
        updatedAt: NOW,
      });

    const report = await encryptCredentials(
      storage.db().collection(SYNC_COLLECTIONS.credentials),
      { dryRun: true, batchSize: 50, encryptionKey: KEY, now: NOW },
    );

    expect(report.matched).toBe(1);
    expect(report.modified).toBe(0);
    const raw = await storage
      .db()
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: mongoObjectId(connectionId) });
    expect(raw?.refreshToken).toBe("legacy-token");
    expect(raw).not.toHaveProperty("refreshTokenCiphertext");
  });

  it("encrypts plaintext rows and is idempotent and resumable", async () => {
    const firstId = objectId() as ConnectionId;
    const secondId = objectId() as ConnectionId;
    const collection = storage.db().collection(SYNC_COLLECTIONS.credentials);
    await collection.insertMany([
      {
        _id: mongoObjectId(firstId),
        credentialKind: "oauthRefresh",
        provider: "google",
        refreshToken: "token-a",
        accessToken: null,
        accessTokenExpiresAt: null,
        refreshFailureCount: 0,
        scopes: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        _id: mongoObjectId(secondId),
        credentialKind: "oauthRefresh",
        provider: "microsoft",
        refreshToken: "token-b",
        accessToken: null,
        accessTokenExpiresAt: null,
        refreshFailureCount: 0,
        scopes: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const first = await encryptCredentials(collection, {
      dryRun: false,
      batchSize: 1,
      encryptionKey: KEY,
      now: NOW,
      sleep: async () => undefined,
    });
    expect(first.modified).toBe(2);

    const second = await encryptCredentials(collection, {
      dryRun: false,
      batchSize: 50,
      encryptionKey: KEY,
      now: NOW,
      sleep: async () => undefined,
    });
    expect(second.modified).toBe(0);
    expect(second.matched).toBe(0);

    for (const [connectionId, plaintext] of [
      [firstId, "token-a"],
      [secondId, "token-b"],
    ] as const) {
      const raw = await collection.findOne({
        _id: mongoObjectId(connectionId),
      });
      expect(raw).not.toHaveProperty("refreshToken");
      expect(raw?.refreshTokenCiphertext).toBeString();
      expect(
        decryptCredentialAtRest(KEY, {
          ciphertext: String(raw?.refreshTokenCiphertext),
          iv: String(raw?.refreshTokenIv),
          tag: String(raw?.refreshTokenTag),
          keyVersion: Number(raw?.keyVersion),
        }),
      ).toBe(plaintext);
      expect(JSON.stringify(raw)).not.toContain(plaintext);
    }
  });
});
