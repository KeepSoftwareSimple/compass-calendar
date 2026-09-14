import { ensureBillingIndexes } from "@backend/billing/billing-indexes";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import publicBookingService from "@backend/booking/services/public-booking.service";
import { ensureCalendarIndexes } from "@backend/calendar/calendar-indexes";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { createBackendHttpServer } from "@backend/servers/express/express.server";
import { foregroundSyncRefresh } from "@backend/servers/sse/foreground-sync-refresh";
import { syncChangeFeedBridge } from "@backend/servers/sse/sync-change-feed.bridge";
import userService from "@backend/user/services/user.service";
import { ensureUserIndexes } from "@backend/user/user-indexes";
import { logger } from "./init"; //must be first import
import { stopPostHogLogs } from "./logging/posthog-logs";
import { type Server } from "node:http";

const httpServer: Server = createBackendHttpServer();

function onClose() {
  logger.info(`Http server terminated`);
}

async function start() {
  try {
    await mongoService.start();
    await ensureBillingIndexes();
    await ensureBookingIndexes();
    await ensureCalendarIndexes();
    await ensureUserIndexes();

    await new Promise((resolve) =>
      httpServer.listen(CONFIG.PORT, () => {
        logger.info(`Server running on port: ${CONFIG.PORT}`);
        // Config is read once at startup, so this line is the only way to
        // confirm a redeploy actually picked up an allowlist change. Count
        // only -- the addresses stay out of the logs.
        if (CONFIG.BILLING_BYPASS_EMAILS.length > 0) {
          logger.info(
            `Billing bypass: ${CONFIG.BILLING_BYPASS_EMAILS.length} account(s)`,
          );
        }
        resolve(undefined);
      }),
    );

    // One multiplexed poll of Sync's global change feed for the life of this
    // process, fanning invalidations out to whichever SSE subscribers are
    // locally connected. Started here (not at module import) so a test
    // importing the bridge for its types never triggers a live network poll.
    syncChangeFeedBridge.start();
    foregroundSyncRefresh.start();
    userService.startAccountDeletionRetries();
    publicBookingService.startRecoveryRetries();
  } catch (error) {
    logger.error("Problems encountered during startup", error);

    // Exit 0 reads as success to supervisors using restart-on-failure
    // policies (e.g. Docker's `restart: on-failure`), so a startup failure
    // never gets retried.
    process.exit(1);
  }
}

async function closeHttpServer(): Promise<void> {
  if (httpServer.listening) {
    await new Promise((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve(undefined))),
    );
  }
}

async function gracefulShutdown(): Promise<void> {
  try {
    syncChangeFeedBridge.stop();
    foregroundSyncRefresh.stop();
    await userService.stopAccountDeletionRetries();
    await publicBookingService.stopRecoveryRetries();
    await closeHttpServer();
    await mongoService.stop();
    await stopPostHogLogs();
  } catch (error) {
    logger.error("Problems encountered while shutting down", error);
  }
}

httpServer.on("close", onClose);

// Registering a handler suppresses Node's default crash-on-unhandled-
// rejection behavior, so without one of our own the process would keep
// running silently after whatever left a promise dangling - no log, no
// restart, just a process in an unknown state. Log with context, then exit
// the same way an uncaught synchronous throw would. `reason` can be
// anything, including a raw GaxiosError from an uncaught Google API call
// (its `config`/`response` carry request headers/bearer tokens as own
// enumerable properties) - never log it directly.
process.on("unhandledRejection", (reason) => {
  logger.error(
    "Unhandled promise rejection",
    reason instanceof Error
      ? { message: reason.message, stack: reason.stack }
      : { reason: String(reason) },
  );
  process.exit(1);
});

// graceful shutdown keeps Bun watch restarts and local exits clean
process.on("SIGTERM", () => {
  void gracefulShutdown();
});
process.on("SIGINT", () => {
  void gracefulShutdown();
});
process.on("SIGQUIT", () => {
  void gracefulShutdown();
});

if (import.meta.main) {
  void start();
}
