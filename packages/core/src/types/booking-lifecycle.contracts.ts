import { z } from "zod/v4";
import { BookingDurationMinutesSchema } from "@core/types/booking.contracts";
import { DateTimeSchema } from "@core/types/domain-primitives";

/**
 * Authoritative server booking-operation telemetry (WP-11).
 *
 * Browser funnels stay in `booking-funnel.ts`. These events are emitted from
 * backend Mongo transitions and a periodic backlog heartbeat. Distinct id is
 * the backend service, never a host, guest, or reservation.
 *
 * Dedupe: one capture per durable status / first-error transition. Lost
 * captures are not replayed. Mongo remains the source of truth. A random
 * analytics delivery id is not used: it would not join to an operation, and
 * reservation / command / event ids are forbidden on the wire.
 */
export const BOOKING_OPERATION_EVENT = "booking_operation" as const;
export const BOOKING_OPERATION_HEARTBEAT_EVENT =
  "booking_operation_heartbeat" as const;
/** Cadence of `booking_operation_heartbeat`. Dashboard alerts assume this. */
export const BOOKING_OPERATION_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const BOOKING_LIFECYCLE_DISTINCT_ID = "compass-backend-booking" as const;
export const BOOKING_LIFECYCLE_SERVICE = "compass-backend" as const;

export const BookingLifecycleOperationSchema = z.enum([
  "create",
  "cancel",
  "reschedule",
  "edit",
]);
export type BookingLifecycleOperation = z.infer<
  typeof BookingLifecycleOperationSchema
>;

export const BookingLifecyclePhaseSchema = z.enum([
  "accepted",
  "pending",
  "confirmed",
  "failed",
  "recovered",
  "compensation",
]);
export type BookingLifecyclePhase = z.infer<typeof BookingLifecyclePhaseSchema>;

export const BookingLifecycleOutcomeSchema = z.enum([
  "success",
  "conflict",
  "validation",
  "rate_limited",
  "provider",
  "transport",
  "storage",
  "exhausted",
]);
export type BookingLifecycleOutcome = z.infer<
  typeof BookingLifecycleOutcomeSchema
>;

export const BookingLifecycleReasonSchema = z.enum([
  "invalid_input",
  "slot_unavailable",
  "reservation_conflict",
  "rate_limited",
  "provider_failure",
  "sync_unavailable",
  "storage_failure",
  "retry_exhausted",
  "unknown",
]);
export type BookingLifecycleReason = z.infer<
  typeof BookingLifecycleReasonSchema
>;

export const BookingLifecycleSourceSchema = z.enum(["operation", "request"]);
export type BookingLifecycleSource = z.infer<
  typeof BookingLifecycleSourceSchema
>;

export const BookingOperationEventSchema = z.strictObject({
  environment: z.string().min(1),
  version: z.string().min(1),
  service: z.literal(BOOKING_LIFECYCLE_SERVICE),
  source: BookingLifecycleSourceSchema,
  operation: BookingLifecycleOperationSchema,
  phase: BookingLifecyclePhaseSchema,
  outcome: BookingLifecycleOutcomeSchema,
  reason: BookingLifecycleReasonSchema.optional(),
  duration_minutes: BookingDurationMinutesSchema.optional(),
  latency_ms: z.number().int().nonnegative().optional(),
});
export type BookingOperationEvent = z.infer<typeof BookingOperationEventSchema>;

export const BookingOperationHeartbeatSchema = z.strictObject({
  environment: z.string().min(1),
  version: z.string().min(1),
  service: z.literal(BOOKING_LIFECYCLE_SERVICE),
  pending_count: z.number().int().nonnegative(),
  oldest_pending_age_ms: z.number().int().nonnegative().nullable(),
  retry_exhausted_count: z.number().int().nonnegative(),
  computedAt: DateTimeSchema,
});
export type BookingOperationHeartbeat = z.infer<
  typeof BookingOperationHeartbeatSchema
>;
