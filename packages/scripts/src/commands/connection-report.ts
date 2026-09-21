import {
  buildConnectionReport,
  formatConnectionReport,
} from "@scripts/commands/connection-report/report";
import { MongoClient } from "mongodb";
import { loadCompassConfig } from "@core/config/compass.config";
import { Logger } from "@core/logger/winston.logger";
import { SyncMongoService } from "@sync/storage/sync-mongo.service";

const logger = Logger("scripts.commands.connection-report");

export const CONNECTION_REPORT_USAGE = `Usage: bun run cli connection-report [--json] [--api-mongo-uri <uri>]

Print a read-only report of Sync connections grouped by provider, state, and
stateReason, with counts, oldest and newest updatedAt, and how many belong to
a principal active in the last 30 and 90 days. Lists importing connections
older than one hour by id.

Options:
  --json                 Print machine-readable JSON
  --api-mongo-uri <uri>  Compass API Mongo URI for lastSeenAt activity
  -h, --help             Show this help
`;

export type ConnectionReportCliOptions = {
  json: boolean;
  apiMongoUri: string | null;
  help: boolean;
};

export function parseConnectionReportArgs(
  argv: string[],
): ConnectionReportCliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { json: false, apiMongoUri: null, help: true };
  }

  const uriFlag = argv.indexOf("--api-mongo-uri");
  let apiMongoUri: string | null = null;
  if (uriFlag >= 0) {
    const value = argv[uriFlag + 1]?.trim();
    if (!value || value.startsWith("-")) {
      throw new Error("connection-report --api-mongo-uri requires a value");
    }
    apiMongoUri = value;
  }

  return { json: argv.includes("--json"), apiMongoUri, help: false };
}

function syncMongoUri(): string {
  const fromEnv = process.env["SYNC_MONGO_URI"]?.trim();
  if (fromEnv) return fromEnv;
  const uri = loadCompassConfig().sync?.mongoUri?.trim();
  if (!uri) {
    throw new Error(
      "Set SYNC_MONGO_URI or add sync.mongoUri to compass.yaml before connection-report",
    );
  }
  return uri;
}

function configMongoUri(): string | undefined {
  try {
    return loadCompassConfig().mongo?.uri;
  } catch {
    return undefined;
  }
}

function enforceLeastPrivilege(): boolean {
  try {
    const value = loadCompassConfig().sync?.enforceLeastPrivilege;
    return value === true || value === "true";
  } catch {
    return false;
  }
}

export function resolveApiMongoUri(input: {
  flag: string | null;
  leastPrivilege: boolean;
  envUri?: string;
  configUri?: string;
}): string | null {
  if (input.flag) return input.flag;
  if (input.leastPrivilege) return null;
  const fromEnv = input.envUri?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = input.configUri?.trim();
  return fromConfig || null;
}

/**
 * Read-only inventory of Sync connections by provider, state, and reason,
 * joined to backend lastSeenAt activity when an API Mongo URI is available.
 *
 * Usage:
 *   bun run cli connection-report [--json] [--api-mongo-uri <uri>]
 */
export async function runConnectionReport(): Promise<void> {
  const syncMongo = new SyncMongoService();
  let usersClient: MongoClient | null = null;
  try {
    const options = parseConnectionReportArgs(process.argv.slice(3));
    if (options.help) {
      process.stdout.write(CONNECTION_REPORT_USAGE);
      process.exit(0);
    }

    const leastPrivilege = enforceLeastPrivilege();
    const apiMongoUri = resolveApiMongoUri({
      flag: options.apiMongoUri,
      leastPrivilege,
      envUri: process.env["MONGO_URI"],
      configUri: configMongoUri(),
    });

    await syncMongo.connect({
      uri: syncMongoUri(),
      enforceLeastPrivilege: false,
      forbiddenDatabaseName: "prod_calendar",
    });

    if (apiMongoUri) {
      usersClient = new MongoClient(apiMongoUri);
      await usersClient.connect();
    }

    const report = await buildConnectionReport({
      syncDb: syncMongo.db,
      usersDb: usersClient?.db() ?? null,
    });

    process.stdout.write(formatConnectionReport(report, options.json));
    logger.info(
      `connection-report rows=${report.rows.length} staleImporting=${report.staleImporting.length} activityAvailable=${report.activityAvailable}`,
    );

    if (usersClient) await usersClient.close();
    await syncMongo.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(error);
    try {
      if (usersClient) await usersClient.close();
    } catch {
      // ignore
    }
    try {
      await syncMongo.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}
