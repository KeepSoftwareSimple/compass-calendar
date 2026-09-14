import {
  bookingMeetingDurationMinutes,
  bookingOperationEventProperties,
  bookingOperationForRateLimitPrefix,
  bookingOperationHeartbeatProperties,
  bookingOperationLifecycleTransition,
  bookingRequestLifecycleSignal,
  classifyBookingLifecycleFailure,
} from "@core/booking/booking-operation-lifecycle";
import {
  BOOKING_LIFECYCLE_SERVICE,
  BookingOperationEventSchema,
  BookingOperationHeartbeatSchema,
} from "@core/types/booking-lifecycle.contracts";
import { describe, expect, it } from "bun:test";

const pending = {
  status: "pending",
  attemptCount: 0,
  lastError: null as string | null,
};

describe("bookingOperationLifecycleTransition", () => {
  it("emits accepted once when a pending row is inserted", () => {
    expect(bookingOperationLifecycleTransition(null, pending)).toEqual({
      phase: "accepted",
      outcome: "success",
    });
  });

  it("emits confirmed on the first pending-to-confirmed path", () => {
    expect(
      bookingOperationLifecycleTransition(pending, {
        status: "confirmed",
        attemptCount: 0,
        lastError: null,
      }),
    ).toEqual({ phase: "confirmed", outcome: "success" });
  });

  it("emits pending on first submit and does not re-emit the same status", () => {
    const submitted = {
      status: "submitted",
      attemptCount: 0,
      lastError: null as string | null,
    };
    expect(bookingOperationLifecycleTransition(pending, submitted)).toEqual({
      phase: "pending",
      outcome: "success",
    });
    expect(
      bookingOperationLifecycleTransition(submitted, submitted),
    ).toBeNull();
  });

  it("emits pending on the first lastError and not on later retries of the same error", () => {
    const firstError = {
      status: "pending",
      attemptCount: 0,
      lastError: "PROVIDER_FAILURE: 502",
    };
    expect(bookingOperationLifecycleTransition(pending, firstError)).toEqual({
      phase: "pending",
      outcome: "provider",
      reason: "provider_failure",
    });
    expect(
      bookingOperationLifecycleTransition(firstError, {
        ...firstError,
        attemptCount: 2,
      }),
    ).toBeNull();
  });

  it("emits recovered after a claimed retry confirms", () => {
    expect(
      bookingOperationLifecycleTransition(
        { status: "submitted", attemptCount: 1, lastError: null },
        { status: "confirmed", attemptCount: 1, lastError: null },
      ),
    ).toEqual({ phase: "recovered", outcome: "success" });
  });

  it("emits recovered when a previous lastError later confirms", () => {
    expect(
      bookingOperationLifecycleTransition(
        {
          status: "pending",
          attemptCount: 0,
          lastError: "SYNC_UNAVAILABLE",
        },
        { status: "confirmed", attemptCount: 1, lastError: "SYNC_UNAVAILABLE" },
      ),
    ).toEqual({ phase: "recovered", outcome: "success" });
  });

  it("emits failed exhausted when retries are spent", () => {
    expect(
      bookingOperationLifecycleTransition(
        {
          status: "pending",
          attemptCount: 16,
          lastError: "PROVIDER_FAILURE",
        },
        {
          status: "failed",
          attemptCount: 16,
          lastError: "PROVIDER_FAILURE",
        },
      ),
    ).toEqual({
      phase: "failed",
      outcome: "exhausted",
      reason: "retry_exhausted",
    });
  });

  it("emits compensation for an abandoned pending overlap loss", () => {
    expect(
      bookingOperationLifecycleTransition(pending, {
        status: "compensated",
        attemptCount: 0,
        lastError: null,
      }),
    ).toEqual({
      phase: "compensation",
      outcome: "conflict",
      reason: "unknown",
    });
  });

  it("does not emit entering compensating; heartbeat covers that backlog", () => {
    expect(
      bookingOperationLifecycleTransition(pending, {
        status: "compensating",
        attemptCount: 1,
        lastError: null,
      }),
    ).toBeNull();
  });

  it("emits pending when compensation itself schedules a retry", () => {
    expect(
      bookingOperationLifecycleTransition(
        { status: "compensating", attemptCount: 1, lastError: null },
        {
          status: "compensating",
          attemptCount: 1,
          lastError: "PROVIDER_FAILURE",
        },
      ),
    ).toEqual({
      phase: "pending",
      outcome: "provider",
      reason: "provider_failure",
    });
  });
});

describe("classifyBookingLifecycleFailure", () => {
  it("maps expected request codes away from provider failures", () => {
    expect(classifyBookingLifecycleFailure({ code: "INVALID_INPUT" })).toEqual({
      outcome: "validation",
      reason: "invalid_input",
    });
    expect(
      classifyBookingLifecycleFailure({ code: "SLOT_UNAVAILABLE" }),
    ).toEqual({
      outcome: "conflict",
      reason: "slot_unavailable",
    });
    expect(classifyBookingLifecycleFailure({ code: "RATE_LIMITED" })).toEqual({
      outcome: "rate_limited",
      reason: "rate_limited",
    });
    expect(
      classifyBookingLifecycleFailure({ code: "SYNC_UNAVAILABLE" }),
    ).toEqual({
      outcome: "transport",
      reason: "sync_unavailable",
    });
  });

  it("maps storage duplicate keys without echoing the message", () => {
    expect(
      classifyBookingLifecycleFailure({
        message: "E11000 duplicate key error collection: bookingOperation",
      }),
    ).toEqual({ outcome: "storage", reason: "storage_failure" });
  });
});

describe("bookingRequestLifecycleSignal", () => {
  it("emits only expected request-level 409/validation/429 outcomes", () => {
    expect(bookingRequestLifecycleSignal("INVALID_INPUT")).toEqual({
      phase: "failed",
      outcome: "validation",
      reason: "invalid_input",
    });
    expect(bookingRequestLifecycleSignal("RESERVATION_CONFLICT")).toEqual({
      phase: "failed",
      outcome: "conflict",
      reason: "reservation_conflict",
    });
    expect(bookingRequestLifecycleSignal("PROVIDER_FAILURE")).toBeNull();
    expect(bookingRequestLifecycleSignal("INTERNAL_ERROR")).toBeNull();
  });
});

describe("bookingOperationEventProperties", () => {
  it("keeps the allowlist and drops non-canonical meeting lengths", () => {
    const createdAt = new Date("2026-09-14T10:00:00.000Z");
    const properties = bookingOperationEventProperties({
      environment: "test",
      version: "1.2.3",
      source: "operation",
      operation: "create",
      signal: { phase: "confirmed", outcome: "success" },
      createdAt,
      slotStart: createdAt,
      slotEnd: new Date("2026-09-14T10:30:00.000Z"),
      now: new Date("2026-09-14T10:00:01.500Z"),
    });
    expect(BookingOperationEventSchema.parse(properties)).toEqual({
      environment: "test",
      version: "1.2.3",
      service: BOOKING_LIFECYCLE_SERVICE,
      source: "operation",
      operation: "create",
      phase: "confirmed",
      outcome: "success",
      duration_minutes: 30,
      latency_ms: 1500,
    });
    expect(JSON.stringify(properties)).not.toContain("reservation");
    expect(bookingMeetingDurationMinutes(createdAt, createdAt)).toBeUndefined();
    expect(
      BookingOperationEventSchema.safeParse({
        ...properties,
        reservationId: "507f1f77bcf86cd799439011",
      }).success,
    ).toBe(false);
  });
});

describe("bookingOperationHeartbeatProperties", () => {
  it("emits zeros with a null oldest age so missing telemetry is distinct", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const properties = bookingOperationHeartbeatProperties({
      environment: "test",
      version: "dev",
      pendingCount: 0,
      oldestPendingCreatedAt: null,
      retryExhaustedCount: 0,
      now,
    });
    expect(BookingOperationHeartbeatSchema.parse(properties)).toEqual({
      environment: "test",
      version: "dev",
      service: BOOKING_LIFECYCLE_SERVICE,
      pending_count: 0,
      oldest_pending_age_ms: null,
      retry_exhausted_count: 0,
      computedAt: now.toISOString() as typeof properties.computedAt,
    });
  });

  it("reports oldest pending age from createdAt", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const properties = bookingOperationHeartbeatProperties({
      environment: "test",
      version: "dev",
      pendingCount: 2,
      oldestPendingCreatedAt: new Date("2026-09-14T11:59:00.000Z"),
      retryExhaustedCount: 1,
      now,
    });
    expect(properties.pending_count).toBe(2);
    expect(properties.oldest_pending_age_ms).toBe(60_000);
    expect(properties.retry_exhausted_count).toBe(1);
  });
});

describe("bookingOperationForRateLimitPrefix", () => {
  it("maps mutation limiters and ignores page reads", () => {
    expect(bookingOperationForRateLimitPrefix("booking:confirm")).toBe(
      "create",
    );
    expect(bookingOperationForRateLimitPrefix("booking:cancel")).toBe("cancel");
    expect(bookingOperationForRateLimitPrefix("booking:reschedule")).toBe(
      "reschedule",
    );
    expect(
      bookingOperationForRateLimitPrefix("booking:reservation-patch"),
    ).toBe("edit");
    expect(bookingOperationForRateLimitPrefix("booking:page")).toBeNull();
  });
});
