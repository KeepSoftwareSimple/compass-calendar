import { encryptCredentials } from "@scripts/commands/encrypt-credentials/backfill";
import { resolveSyncMongoUri } from "@scripts/common/sync-mongo-uri";
import { loadCompassConfig } from "@core/config/compass.config";
import { Logger } from "@core/logger/winston.logger";
import { decodeCredentialAtRestKey } from "@core/security/credential-at-rest";
import { SyncMongoService } from "@sync/storage/sync-mongo.service";

const logger = Logger("scripts.commands.encrypt-credentials");

function credentialEncryptionKey(): string {
  const fromEnv = process.env["SYNC_CREDENTIAL_ENCRYPTION_KEY"]?.trim();
  if (fromEnv) {
    decodeCredentialAtRestKey(fromEnv);
    return fromEnv;
  }
  const key = loadCompassConfig().sync?.credentialEncryptionKey?.trim();
  if (!key) {
    throw new Error(
      "Set SYNC_CREDENTIAL_ENCRYPTION_KEY or add sync.credentialEncryptionKey to compass.yaml before encrypt-credentials",
    );
  }
  decodeCredentialAtRestKey(key);
  return key;
}

function parseArgs(argv: string[]): { dryRun: boolean; batchSize: number } {
  const batchFlag = argv.indexOf("--batch-size");
  const batchSize = batchFlag >= 0 ? Number(argv[batchFlag + 1]) : 200;
  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new Error(
      "encrypt-credentials --batch-size must be a positive number",
    );
  }
  return { dryRun: !argv.includes("--apply"), batchSize };
}

/**
 * Encrypt legacy plaintext OAuth refresh tokens in the Sync credentials
 * collection. Dry-run by default; pass `--apply` to write.
 *
 * Usage:
 *   bun run cli encrypt-credentials [--apply] [--batch-size 200]
 */
export async function runEncryptCredentials(): Promise<void> {
  const syncMongo = new SyncMongoService();
  try {
    const { dryRun, batchSize } = parseArgs(process.argv.slice(3));
    const encryptionKey = credentialEncryptionKey();
    await syncMongo.connect({
      uri: resolveSyncMongoUri("encrypt-credentials"),
      enforceLeastPrivilege: false,
      forbiddenDatabaseName: "prod_calendar",
    });

    logger.info(`encrypt-credentials dryRun=${dryRun} batchSize=${batchSize}`);

    const report = await encryptCredentials(
      syncMongo.db.collection("credentials"),
      {
        dryRun,
        batchSize,
        encryptionKey,
      },
    );

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    logger.info(
      `encrypt-credentials dryRun=${report.dryRun} matched=${report.matched} modified=${report.modified} skippedAlreadyEncrypted=${report.skippedAlreadyEncrypted}`,
    );

    await syncMongo.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(error);
    try {
      await syncMongo.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}
