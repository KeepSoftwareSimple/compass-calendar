import {
  type BookingDurationMinutes,
  BookingDurationMinutesSchema,
} from "@core/types/booking.contracts";
import {
  BOOKING_LIFECYCLE_SERVICE,
  type BookingLifecycleOperation,
  type BookingLifecycleOutcome,
  type BookingLifecyclePhase,
  type BookingLifecycleReason,
  type BookingOperationEvent,
  BookingOperationEventSchema,
  type BookingOperationHeartbeat,
  BookingOperationHeartbeatSchema,
} from "@core/types/booking-lifecycle.contracts";
import { DateTimeSchema } from "@core/types/domain-primitives";

export interface BookingOperationLifecycleSnapshot {
  status: string;
  attemptCount: number;
  lastError: string | null;
  createdAt?: Date;
  slotStart?: Date;
  slotEnd?: Date;
}

export interface BookingOperationLifecycleSignal {
  phase: BookingLifecyclePhase;
  outcome: BookingLifecycleOutcome;
  reason?: BookingLifecycleReason;
}

const FAILURE_CODE_REASON: Record<string, BookingLifecycleReason> = {
  INVALID_INPUT: "invalid_input",
  TIMEZONE_REQUIRED: "invalid_input",
  AVAILABILITY_REQUIRED: "invalid_input",
  BLOCKING_CALENDAR_INVALID: "invalid_input",
  SLOT_UNAVAILABLE: "slot_unavailable",
  RESERVATION_CONFLICT: "reservation_conflict",
  RATE_LIMITED: "rate_limited",
  PROVIDER_FAILURE: "provider_failure",
  SYNC_UNAVAILABLE: "sync_unavailable",
  MAINTENANCE: "sync_unavailable",
  DUPLICATE_EVENT_ID: "storage_failure",
};

const RATE_LIMIT_OPERATION_BY_PREFIX: Record<
  string,
  BookingLifecycleOperation
> = {
  "booking:confirm": "create",
  "booking:cancel": "cancel",
  "booking:reschedule": "reschedule",
  "booking:reservation-patch": "edit",
};

const outcomeForReason = (
  reason: BookingLifecycleReason,
): BookingLifecycleOutcome => {
  if (reason === "invalid_input") return "validation";
  if (reason === "slot_unavailable" || reason === "reservation_conflict") {
    return "conflict";
  }
  if (reason === "rate_limited") return "rate_limited";
  if (reason === "sync_unavailable") return "transport";
  if (reason === "storage_failure") return "storage";
  if (reason === "retry_exhausted") return "exhausted";
  if (reason === "provider_failure") return "provider";
  return "provider";
};

const reasonFromToken = (token: string): BookingLifecycleReason | undefined =>
  FAILURE_CODE_REASON[token];

const firstFailureToken = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const match = /\b([A-Z][A-Z0-9_]{2,})\b/.exec(text);
  return match?.[1] ?? null;
};

export function classifyBookingLifecycleFailure(input: {
  code?: string | null;
  message?: string | null;
}): { outcome: BookingLifecycleOutcome; reason: BookingLifecycleReason } {
  const fromCode = input.code ? reasonFromToken(input.code) : undefined;
  if (fromCode) {
    return { outcome: outcomeForReason(fromCode), reason: fromCode };
  }

  const fromMessage = reasonFromToken(firstFailureToken(input.message) ?? "");
  if (fromMessage) {
    return { outcome: outcomeForReason(fromMessage), reason: fromMessage };
  }

  const message = input.message ?? "";
  if (/\bE11000\b|duplicate key|MongoServerError/i.test(message)) {
    return { outcome: "storage", reason: "storage_failure" };
  }
  if (
    /\b(ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed|network)\b/i.test(
      message,
    )
  ) {
    return { outcome: "transport", reason: "sync_unavailable" };
  }

  return { outcome: "provider", reason: "unknown" };
}

export function bookingOperationForRateLimitPrefix(
  prefix: string,
): BookingLifecycleOperation | null {
  return RATE_LIMIT_OPERATION_BY_PREFIX[prefix] ?? null;
}

export function bookingRequestLifecycleSignal(code: string): {
  phase: "failed";
  outcome: BookingLifecycleOutcome;
  reason: BookingLifecycleReason;
} | null {
  const classified = classifyBookingLifecycleFailure({ code });
  if (
    classified.outcome !== "validation" &&
    classified.outcome !== "conflict" &&
    classified.outcome !== "rate_limited"
  ) {
    return null;
  }
  if (classified.reason === "unknown") return null;
  return {
    phase: "failed",
    outcome: classified.outcome,
    reason: classified.reason,
  };
}

export function bookingMeetingDurationMinutes(
  slotStart?: Date,
  slotEnd?: Date,
): BookingDurationMinutes | undefined {
  if (!slotStart || !slotEnd) return undefined;
  const minutes = Math.round(
    (slotEnd.getTime() - slotStart.getTime()) / 60_000,
  );
  const parsed = BookingDurationMinutesSchema.safeParse(minutes);
  return parsed.success ? parsed.data : undefined;
}

export function bookingOperationLifecycleTransition(
  previous: BookingOperationLifecycleSnapshot | null,
  current: BookingOperationLifecycleSnapshot,
): BookingOperationLifecycleSignal | null {
  if (!previous) {
    if (current.status === "pending") {
      return { phase: "accepted", outcome: "success" };
    }
    return null;
  }

  const statusChanged = previous.status !== current.status;
  const lastErrorAppeared =
    previous.lastError == null && current.lastError != null;

  if (!statusChanged && !lastErrorAppeared) {
    return null;
  }

  if (current.status === "confirmed" && previous.status !== "confirmed") {
    const recovered = previous.attemptCount > 0 || previous.lastError != null;
    return {
      phase: recovered ? "recovered" : "confirmed",
      outcome: "success",
    };
  }

  if (current.status === "failed" && previous.status !== "failed") {
    return {
      phase: "failed",
      outcome: "exhausted",
      reason: "retry_exhausted",
    };
  }

  if (current.status === "compensated" && previous.status !== "compensated") {
    if (current.lastError == null && previous.lastError == null) {
      return { phase: "compensation", outcome: "conflict", reason: "unknown" };
    }
    const classified = classifyBookingLifecycleFailure({
      message: current.lastError ?? previous.lastError,
    });
    return {
      phase: "compensation",
      outcome:
        classified.outcome === "success" ? "conflict" : classified.outcome,
      reason: classified.reason,
    };
  }

  if (current.status === "submitted" && previous.status !== "submitted") {
    const classified = current.lastError
      ? classifyBookingLifecycleFailure({ message: current.lastError })
      : null;
    return {
      phase: "pending",
      outcome: classified?.outcome ?? "success",
      reason: classified?.reason,
    };
  }

  if (
    lastErrorAppeared &&
    (current.status === "pending" ||
      current.status === "submitted" ||
      current.status === "compensating")
  ) {
    const classified = classifyBookingLifecycleFailure({
      message: current.lastError,
    });
    return {
      phase: "pending",
      outcome: classified.outcome,
      reason: classified.reason,
    };
  }

  return null;
}

export function bookingOperationEventProperties(input: {
  environment: string;
  version: string;
  source: BookingOperationEvent["source"];
  operation: BookingLifecycleOperation;
  signal: BookingOperationLifecycleSignal;
  createdAt?: Date;
  slotStart?: Date;
  slotEnd?: Date;
  now?: Date;
}): BookingOperationEvent {
  const now = input.now ?? new Date();
  const durationMinutes = bookingMeetingDurationMinutes(
    input.slotStart,
    input.slotEnd,
  );
  const latencyMs =
    input.createdAt !== undefined
      ? Math.max(0, now.getTime() - input.createdAt.getTime())
      : undefined;
  return BookingOperationEventSchema.parse({
    environment: input.environment,
    version: input.version,
    service: BOOKING_LIFECYCLE_SERVICE,
    source: input.source,
    operation: input.operation,
    phase: input.signal.phase,
    outcome: input.signal.outcome,
    ...(input.signal.reason ? { reason: input.signal.reason } : {}),
    ...(durationMinutes !== undefined
      ? { duration_minutes: durationMinutes }
      : {}),
    ...(latencyMs !== undefined ? { latency_ms: latencyMs } : {}),
  });
}

export function bookingOperationHeartbeatProperties(input: {
  environment: string;
  version: string;
  pendingCount: number;
  oldestPendingCreatedAt: Date | null;
  retryExhaustedCount: number;
  now?: Date;
}): BookingOperationHeartbeat {
  const now = input.now ?? new Date();
  return BookingOperationHeartbeatSchema.parse({
    environment: input.environment,
    version: input.version,
    service: BOOKING_LIFECYCLE_SERVICE,
    pending_count: input.pendingCount,
    oldest_pending_age_ms: input.oldestPendingCreatedAt
      ? Math.max(0, now.getTime() - input.oldestPendingCreatedAt.getTime())
      : null,
    retry_exhausted_count: input.retryExhaustedCount,
    computedAt: DateTimeSchema.parse(now.toISOString()),
  });
}
