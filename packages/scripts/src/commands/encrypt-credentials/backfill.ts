import { type Collection, type Document, type ObjectId } from "mongodb";
import { encryptCredentialAtRest } from "@core/security/credential-at-rest";
import { type ConnectionId } from "@core/types/sync/identity.contracts";

export type EncryptCredentialsReport = {
  dryRun: boolean;
  matched: number;
  modified: number;
  skippedAlreadyEncrypted: number;
};

type PlaintextOauthCredentialRow = {
  _id: ConnectionId;
  refreshToken: string;
};

export async function encryptCredentials(
  credentials: Collection<Document>,
  options: {
    dryRun: boolean;
    batchSize: number;
    encryptionKey: string;
    now?: Date;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<EncryptCredentialsReport> {
  const filter = {
    credentialKind: { $ne: "password" as const },
    refreshToken: { $type: "string" as const },
  };

  const matched = await credentials.countDocuments(filter);
  if (options.dryRun || matched === 0) {
    return {
      dryRun: options.dryRun,
      matched,
      modified: 0,
      skippedAlreadyEncrypted: 0,
    };
  }

  let modified = 0;
  let skippedAlreadyEncrypted = 0;
  let lastId: ConnectionId | undefined;

  for (;;) {
    const batchFilter: Document = lastId
      ? { ...filter, _id: { $gt: lastId } }
      : filter;
    const batch = (await credentials
      .find(batchFilter)
      .sort({ _id: 1 })
      .limit(options.batchSize)
      .project({ _id: 1, refreshToken: 1 })
      .toArray()) as PlaintextOauthCredentialRow[];

    if (batch.length === 0) break;

    for (const row of batch) {
      const existing = await credentials.findOne({
        _id: row._id as unknown as ObjectId,
        refreshToken: { $type: "string" },
      });
      if (!existing || typeof existing["refreshToken"] !== "string") {
        skippedAlreadyEncrypted += 1;
        continue;
      }

      const plaintext = existing["refreshToken"];
      const sealed = encryptCredentialAtRest(options.encryptionKey, plaintext);
      const result = await credentials.updateOne(
        { _id: row._id as unknown as ObjectId, refreshToken: plaintext },
        {
          $set: {
            refreshTokenCiphertext: sealed.ciphertext,
            refreshTokenIv: sealed.iv,
            refreshTokenTag: sealed.tag,
            keyVersion: sealed.keyVersion,
            updatedAt: options.now ?? new Date(),
          },
          $unset: { refreshToken: "" },
        },
      );
      if (result.modifiedCount === 1) {
        modified += 1;
      } else {
        skippedAlreadyEncrypted += 1;
      }
    }

    const last = batch[batch.length - 1];
    if (!last) break;
    lastId = last._id;
    if (options.sleep) await options.sleep(50);
  }

  return {
    dryRun: false,
    matched,
    modified,
    skippedAlreadyEncrypted,
  };
}
