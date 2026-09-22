import { emailSendHeartbeatProperties } from "@core/email/email-send-lifecycle";
import { captureSafely } from "@core/logger/posthog-capture";
import { Logger } from "@core/logger/winston.logger";
import {
  EMAIL_LIFECYCLE_DISTINCT_ID,
  EMAIL_SEND_HEARTBEAT_EVENT,
  EMAIL_SEND_HEARTBEAT_INTERVAL_MS,
} from "@core/types/email-lifecycle.contracts";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import { getBackendPostHogClient } from "@backend/common/helpers/backend-posthog-client";
import mongoService from "@backend/common/services/mongo.service";

const logger = Logger("app:email.heartbeat");

const FAILED_WINDOW_MS = 24 * 60 * 60 * 1000;

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

export async function computeEmailSendHeartbeat(now = new Date()) {
  const queuedFilter = { status: "queued" as const };
  const [queuedCount, oldestQueued, failedCount24h] = await Promise.all([
    mongoService.emailSend.countDocuments(queuedFilter),
    mongoService.emailSend.findOne(queuedFilter, {
      sort: { sendAt: 1 },
      projection: { sendAt: 1 },
    }),
    mongoService.emailSend.countDocuments({
      status: "failed",
      updatedAt: { $gte: new Date(now.getTime() - FAILED_WINDOW_MS) },
    }),
  ]);
  const oldestSendAt =
    oldestQueued?.sendAt instanceof Date ? oldestQueued.sendAt : null;
  return emailSendHeartbeatProperties({
    environment: CONFIG.NODE_ENV,
    version: normalizeDeployVersion(CONFIG.VERSION),
    queuedCount,
    oldestQueuedSendAt: oldestSendAt,
    failedCount24h,
    now,
  });
}

export async function emitEmailSendHeartbeat(): Promise<void> {
  try {
    const properties = await computeEmailSendHeartbeat();
    void captureSafely(getBackendPostHogClient(), {
      event: EMAIL_SEND_HEARTBEAT_EVENT,
      distinctId: EMAIL_LIFECYCLE_DISTINCT_ID,
      properties,
    });
  } catch (error: unknown) {
    logger.warn(
      `Email send heartbeat failed: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }
}

export const startEmailSendHeartbeat = (): void => {
  if (heartbeatTimer) return;
  void emitEmailSendHeartbeat();
  heartbeatTimer = setInterval(() => {
    void emitEmailSendHeartbeat();
  }, EMAIL_SEND_HEARTBEAT_INTERVAL_MS);
};

export const stopEmailSendHeartbeat = (): void => {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
};
