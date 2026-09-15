import {
  type BookingOperationLifecycleSnapshot,
  bookingOperationEventProperties,
  bookingOperationForRateLimitPrefix,
  bookingOperationLifecycleTransition,
  bookingRequestLifecycleSignal,
} from "@core/booking/booking-operation-lifecycle";
import { captureSafely } from "@core/logger/posthog-capture";
import {
  BOOKING_LIFECYCLE_DISTINCT_ID,
  BOOKING_OPERATION_EVENT,
  type BookingLifecycleOperation,
} from "@core/types/booking-lifecycle.contracts";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { type BookingOperationRecord } from "@backend/booking/booking-operation.record";
import { CONFIG } from "@backend/common/constants/config.constants";
import { getBackendPostHogClient } from "@backend/common/helpers/backend-posthog-client";

const snapshot = (
  record: BookingOperationRecord,
): BookingOperationLifecycleSnapshot => {
  const hasSlot = record.kind === "create" || record.kind === "reschedule";
  return {
    status: record.status,
    attemptCount: record.attemptCount,
    lastError: record.lastError,
    createdAt: record.createdAt,
    ...(hasSlot
      ? { slotStart: record.slotStart, slotEnd: record.slotEnd }
      : {}),
  };
};

function captureLifecycle(
  properties: ReturnType<typeof bookingOperationEventProperties>,
): void {
  void captureSafely(getBackendPostHogClient(), {
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
    const currentSnapshot = snapshot(current);
    const signal = bookingOperationLifecycleTransition(
      previous ? snapshot(previous) : null,
      currentSnapshot,
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
        slotStart: currentSnapshot.slotStart,
        slotEnd: currentSnapshot.slotEnd,
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
