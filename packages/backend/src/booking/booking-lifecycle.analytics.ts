import {
  type BookingOperationLifecycleSnapshot,
  bookingOperationEventProperties,
  bookingOperationForRateLimitPrefix,
  bookingOperationLifecycleTransition,
  bookingRequestLifecycleSignal,
} from "@core/booking/booking-operation-lifecycle";
import {
  captureSafely,
  createPostHogCaptureClient,
  DEFAULT_POSTHOG_HOST,
  type PostHogCaptureClient,
} from "@core/logger/posthog-capture";
import {
  BOOKING_LIFECYCLE_DISTINCT_ID,
  BOOKING_OPERATION_EVENT,
  type BookingLifecycleOperation,
} from "@core/types/booking-lifecycle.contracts";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { type BookingOperationRecord } from "@backend/booking/booking-operation.record";
import { CONFIG } from "@backend/common/constants/config.constants";

const snapshot = (
  record: BookingOperationRecord,
): BookingOperationLifecycleSnapshot => ({
  status: record.status,
  attemptCount: record.attemptCount,
  lastError: record.lastError,
  createdAt: record.createdAt,
  slotStart:
    record.kind === "create" || record.kind === "reschedule"
      ? record.slotStart
      : undefined,
  slotEnd:
    record.kind === "create" || record.kind === "reschedule"
      ? record.slotEnd
      : undefined,
});

function getClient(): PostHogCaptureClient | null {
  const apiKey = CONFIG.POSTHOG_KEY;
  if (!apiKey) return null;
  return createPostHogCaptureClient({
    apiKey,
    host: CONFIG.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
    lib: "compass-backend",
  });
}

function captureLifecycle(
  properties: ReturnType<typeof bookingOperationEventProperties>,
): void {
  void captureSafely(getClient(), {
    event: BOOKING_OPERATION_EVENT,
    distinctId: BOOKING_LIFECYCLE_DISTINCT_ID,
    properties,
  });
}

export const bookingLifecycleAnalytics = {
  emitTransition(
    previous: BookingOperationRecord | null,
    current: BookingOperationRecord,
  ): void {
    const signal = bookingOperationLifecycleTransition(
      previous ? snapshot(previous) : null,
      snapshot(current),
    );
    if (!signal) return;
    captureLifecycle(
      bookingOperationEventProperties({
        environment: CONFIG.NODE_ENV,
        version: normalizeDeployVersion(CONFIG.VERSION),
        source: "operation",
        operation: current.kind,
        signal,
        createdAt: current.createdAt,
        slotStart: snapshot(current).slotStart,
        slotEnd: snapshot(current).slotEnd,
      }),
    );
  },

  emitRequestFailure(input: {
    operation: BookingLifecycleOperation;
    code: string;
  }): void {
    const signal = bookingRequestLifecycleSignal(input.code);
    if (!signal) return;
    captureLifecycle(
      bookingOperationEventProperties({
        environment: CONFIG.NODE_ENV,
        version: normalizeDeployVersion(CONFIG.VERSION),
        source: "request",
        operation: input.operation,
        signal,
      }),
    );
  },

  emitRateLimited(prefix: string): void {
    const operation = bookingOperationForRateLimitPrefix(prefix);
    if (!operation) return;
    this.emitRequestFailure({ operation, code: "RATE_LIMITED" });
  },
};
