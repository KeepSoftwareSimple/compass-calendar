import { bookingOperationHeartbeatProperties } from "@core/booking/booking-operation-lifecycle";
import {
  captureSafely,
  createPostHogCaptureClient,
  DEFAULT_POSTHOG_HOST,
} from "@core/logger/posthog-capture";
import { Logger } from "@core/logger/winston.logger";
import {
  BOOKING_LIFECYCLE_DISTINCT_ID,
  BOOKING_OPERATION_HEARTBEAT_EVENT,
} from "@core/types/booking-lifecycle.contracts";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { BOOKING_OPERATION_RECOVERABLE_STATUSES } from "@backend/booking/booking-operation.record";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";

const logger = Logger("app:booking.lifecycle.heartbeat");

const BOOKING_OPERATION_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const EXHAUSTED_WINDOW_MS = 24 * 60 * 60 * 1000;

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

function getClient() {
  const apiKey = CONFIG.POSTHOG_KEY;
  if (!apiKey) return null;
  return createPostHogCaptureClient({
    apiKey,
    host: CONFIG.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
    lib: "compass-backend",
  });
}

export async function computeBookingOperationHeartbeat(now = new Date()) {
  const pendingFilter = {
    status: { $in: [...BOOKING_OPERATION_RECOVERABLE_STATUSES] },
  };
  const [pendingCount, oldestPending, retryExhaustedCount] = await Promise.all([
    mongoService.bookingOperation.countDocuments(pendingFilter),
    mongoService.bookingOperation.findOne(pendingFilter, {
      sort: { createdAt: 1 },
      projection: { createdAt: 1 },
    }),
    mongoService.bookingOperation.countDocuments({
      status: "failed",
      updatedAt: { $gte: new Date(now.getTime() - EXHAUSTED_WINDOW_MS) },
    }),
  ]);
  const oldestCreatedAt =
    oldestPending?.createdAt instanceof Date ? oldestPending.createdAt : null;
  return bookingOperationHeartbeatProperties({
    environment: CONFIG.NODE_ENV,
    version: normalizeDeployVersion(CONFIG.VERSION),
    pendingCount,
    oldestPendingCreatedAt: oldestCreatedAt,
    retryExhaustedCount,
    now,
  });
}

export async function emitBookingOperationHeartbeat(): Promise<void> {
  try {
    const properties = await computeBookingOperationHeartbeat();
    void captureSafely(getClient(), {
      event: BOOKING_OPERATION_HEARTBEAT_EVENT,
      distinctId: BOOKING_LIFECYCLE_DISTINCT_ID,
      properties,
    });
  } catch (error: unknown) {
    logger.warn(
      `Booking operation heartbeat failed: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }
}

export const startBookingLifecycleHeartbeat = (): void => {
  if (heartbeatTimer) return;
  void emitBookingOperationHeartbeat();
  heartbeatTimer = setInterval(() => {
    void emitBookingOperationHeartbeat();
  }, BOOKING_OPERATION_HEARTBEAT_INTERVAL_MS);
};

export const stopBookingLifecycleHeartbeat = (): void => {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
};
