import { Logger } from "@core/logger/winston.logger";
import { CONFIG } from "@backend/common/constants/config.constants";
import { SyncServiceClient } from "./sync-service.client";

const logger = Logger("app:sync-service.client");

// Build a client from an explicit URL + secret. Kept separate from the config
// singleton so it is testable without the global CONFIG.
export function buildSyncServiceClient(options: {
  serviceUrl: string;
  secret: string;
  timeoutMs?: number;
}): SyncServiceClient {
  return new SyncServiceClient({
    baseUrl: options.serviceUrl,
    secret: options.secret,
    timeoutMs: options.timeoutMs,
    // `warn`, not `error`: a retry that goes on to succeed is a self-healed
    // blip, and filing it as an exception would bury the failures that
    // actually reached a user. An exhausted retry is still logged by the
    // caller (event.controller's send), so this never double-reports.
    onRetry: (info) =>
      logger.warn(
        `Retrying sync request ${info.method} ${info.path} after ${info.kind}` +
          `${info.status === undefined ? "" : ` (${info.status})`}` +
          ` [attempt=${info.attempt} correlationId=${info.correlationId}]`,
      ),
  });
}

let cached: SyncServiceClient | undefined;

// The process-wide client, built once from config. SYNC_SERVICE_URL and
// SYNC_INTERNAL_AUTH_TOKEN are required config (the process exits at startup
// if either is missing), so this is always a real client.
export function getSyncServiceClient(): SyncServiceClient {
  if (cached) return cached;
  cached = buildSyncServiceClient({
    serviceUrl: CONFIG.SYNC_SERVICE_URL,
    secret: CONFIG.SYNC_INTERNAL_AUTH_TOKEN,
  });
  return cached;
}
