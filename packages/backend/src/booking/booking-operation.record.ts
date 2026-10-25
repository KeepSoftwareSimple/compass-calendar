import { z } from "zod/v4";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { zObjectId } from "@core/types/object-id.schema";

const ObjectIdSchema = zObjectId;

export const BookingOperationKindSchema = z.enum([
  "create",
  "cancel",
  "reschedule",
  "edit",
]);

export const BookingOperationStatusSchema = z.enum([
  "pending",
  "submitted",
  "confirmed",
  "compensating",
  "compensated",
  "failed",
]);
export type BookingOperationStatus = z.infer<
  typeof BookingOperationStatusSchema
>;

const BookingOperationBaseSchema = z.strictObject({
  _id: ObjectIdSchema,
  kind: BookingOperationKindSchema,
  status: BookingOperationStatusSchema,
  reservationId: ObjectIdSchema,
  pageId: ObjectIdSchema,
  userId: ObjectIdSchema,
  calendarId: z.string().trim().min(1).max(256),
  eventId: z.string().trim().min(1).max(256).nullable(),
  attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: z.date(),
  lastError: z.string().trim().max(500).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateBookingOperationRecordSchema =
  BookingOperationBaseSchema.extend({
    kind: z.literal("create"),
    eventId: z.string().trim().min(1).max(256),
    slotStart: z.date(),
    slotEnd: z.date(),
    guestName: z.string().trim().min(1).max(256),
    guestEmail: z.string().trim().min(1).max(320),
    notes: z.string().trim().max(4000).nullable(),
    guestTimeZone: TimeZoneSchema,
    cancelToken: z.string().trim().min(1).max(256),
  });
export type CreateBookingOperationRecord = z.infer<
  typeof CreateBookingOperationRecordSchema
>;

export const CancelBookingOperationRecordSchema =
  BookingOperationBaseSchema.extend({
    kind: z.literal("cancel"),
  });
export type CancelBookingOperationRecord = z.infer<
  typeof CancelBookingOperationRecordSchema
>;

export const RescheduleBookingOperationRecordSchema =
  BookingOperationBaseSchema.extend({
    kind: z.literal("reschedule"),
    slotStart: z.date(),
    slotEnd: z.date(),
    previousSlotStart: z.date(),
    previousSlotEnd: z.date(),
    guestTimeZone: TimeZoneSchema,
  });
export type RescheduleBookingOperationRecord = z.infer<
  typeof RescheduleBookingOperationRecordSchema
>;

export const EditBookingOperationRecordSchema =
  BookingOperationBaseSchema.extend({
    kind: z.literal("edit"),
    guestName: z.string().trim().min(1).max(256),
    notes: z.string().trim().max(4000).nullable(),
    cancelToken: z.string().trim().min(1).max(256),
  });
export type EditBookingOperationRecord = z.infer<
  typeof EditBookingOperationRecordSchema
>;

export const BookingOperationRecordSchema = z.discriminatedUnion("kind", [
  CreateBookingOperationRecordSchema,
  CancelBookingOperationRecordSchema,
  RescheduleBookingOperationRecordSchema,
  EditBookingOperationRecordSchema,
]);
export type BookingOperationRecord = z.infer<
  typeof BookingOperationRecordSchema
>;

/** Overlap arbitration: exhausted `failed` ops must not block new bookings. */
export const BOOKING_OPERATION_IN_FLIGHT_STATUSES = [
  "pending",
  "submitted",
  "compensating",
] as const satisfies readonly BookingOperationStatus[];

/** Guest create idempotency: same intent can resume after a transient `failed`. */
export const BOOKING_OPERATION_RESUMABLE_CREATE_STATUSES = [
  ...BOOKING_OPERATION_IN_FLIGHT_STATUSES,
  "failed",
] as const satisfies readonly BookingOperationStatus[];

/** Heartbeat and claim: same in-flight set as overlap arbitration. */
export const BOOKING_OPERATION_RECOVERABLE_STATUSES =
  BOOKING_OPERATION_IN_FLIGHT_STATUSES;
