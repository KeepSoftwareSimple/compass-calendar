import { type Db } from "mongodb";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";

export const PLAINTEXT_OAUTH_BOOT_MESSAGE =
  "plaintext OAuth credentials remain; run `bun run cli encrypt-credentials --apply`";

const MISSING_AT_REST_KEY =
  "stored credentials require sync.credentialEncryptionKey";

const PLAINTEXT_OAUTH_FILTER = {
  refreshToken: { $type: "string" as const },
  credentialKind: { $ne: "password" as const },
};

const STORED_OAUTH_FILTER = {
  credentialKind: { $ne: "password" as const },
  refreshTokenCiphertext: { $type: "string" as const },
};

export async function countPlaintextOauthRefreshCredentials(
  db: Db,
): Promise<number> {
  return db
    .collection(SYNC_COLLECTIONS.credentials)
    .countDocuments(PLAINTEXT_OAUTH_FILTER);
}

export async function assertOauthCredentialStartupReady(
  db: Db,
  credentialEncryptionKey: string | undefined,
): Promise<void> {
  const plaintextCount = await countPlaintextOauthRefreshCredentials(db);
  if (plaintextCount > 0) {
    throw new Error(PLAINTEXT_OAUTH_BOOT_MESSAGE);
  }

  const storedOauthCount = await db
    .collection(SYNC_COLLECTIONS.credentials)
    .countDocuments(STORED_OAUTH_FILTER);
  if (storedOauthCount > 0 && !credentialEncryptionKey) {
    throw new Error(MISSING_AT_REST_KEY);
  }
}
