import { purgeUserByEmail } from "@scripts/commands/purge-user/purge";
import { type PurgeUserTarget } from "@scripts/commands/purge-user/report.types";
import { resolveSyncMongoUri } from "@scripts/common/sync-mongo-uri";
import { Logger } from "@core/logger/winston.logger";
import supertokensUserCleanupService from "@backend/auth/services/supertokens/supertokens.user-cleanup.service";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { SyncMongoService } from "@sync/storage/sync-mongo.service";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const logger = Logger("scripts.commands.purge-user");

/** Host only - never the credentials that precede it in the URI. */
function hostOf(uri: string): string {
  try {
    return new URL(uri).host || "unknown";
  } catch {
    return "unknown";
  }
}

function parseArgs(argv: string[]): {
  dryRun: boolean;
  email: string;
  outPath: string | null;
} {
  const emailFlag = argv.indexOf("--email");
  const email = emailFlag >= 0 ? argv[emailFlag + 1]?.trim() : undefined;
  if (!email) {
    throw new Error("purge-user requires --email <address>");
  }

  const outFlag = argv.indexOf("--out");
  const outPath =
    outFlag >= 0 && argv[outFlag + 1] ? resolve(argv[outFlag + 1]!) : null;

  return { dryRun: !argv.includes("--apply"), email, outPath };
}

/**
 * Deletes every Compass row for one email address - API database, Sync
 * database, and SuperTokens - so a test account can be reset. Default is
 * dry-run; pass `--apply` to write. Never calls Google, so the account's
 * OAuth grant survives and the next sign-in skips the consent screen.
 *
 * Restores the operator-side account deletion that went away with the old
 * `delete` command (#2154); `DELETE /api/user` only ever deletes the caller.
 *
 * Usage:
 *   bun run cli purge-user --email <address> [--apply] [--out report.json]
 */
export async function runPurgeUser(): Promise<void> {
  const syncMongo = new SyncMongoService();

  try {
    const { dryRun, email, outPath } = parseArgs(process.argv.slice(3));
    const syncUri = resolveSyncMongoUri("purging a user");

    await mongoService.start();
    await syncMongo.connect({
      uri: syncUri,
      enforceLeastPrivilege: false,
      forbiddenDatabaseName: "prod_calendar",
    });

    const target: PurgeUserTarget = {
      host: hostOf(CONFIG.MONGO_URI),
      database: mongoService.db.databaseName,
      syncDatabase: syncMongo.db.databaseName,
    };

    logger.info(
      `purge-user dryRun=${dryRun} email=${email} host=${target.host} db=${target.database} syncDb=${target.syncDatabase}`,
    );

    const report = await purgeUserByEmail(
      {
        db: mongoService.db,
        syncDb: syncMongo.db,
        syncClient: syncMongo.client,
        cleanupAuth: (address) =>
          supertokensUserCleanupService.cleanupByEmail(address),
      },
      email,
      { dryRun, target },
    );

    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (outPath) {
      writeFileSync(outPath, json, "utf8");
      logger.info(`Wrote purge report to ${outPath}`);
    } else {
      process.stdout.write(json);
    }

    if (report.authError) {
      logger.warn(
        `SuperTokens cleanup failed (${report.authError}); Mongo rows were purged. Rerun --apply once the core is reachable.`,
      );
    }

    logger.info(
      `purge-user dryRun=${report.dryRun} users=${report.users.length} events=${report.users.reduce((sum, user) => sum + user.counts.events, 0)}`,
    );

    await syncMongo.disconnect();
    await mongoService.stop();
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
