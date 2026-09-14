import { z } from "zod/v4";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { zObjectId } from "@core/types/type.utils";

const ObjectIdSchema = zObjectId;

export const BookingOperationKindSchema = z.enum([
  "create",
  "cancel",
  "reschedule",
]);
export type BookingOperationKind = z.infer<typeof BookingOperationKindSchema>;

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

export const BookingOperationRecordSchema = z.discriminatedUnion("kind", [
  CreateBookingOperationRecordSchema,
  CancelBookingOperationRecordSchema,
  RescheduleBookingOperationRecordSchema,
]);
export type BookingOperationRecord = z.infer<
  typeof BookingOperationRecordSchema
>;

export const BOOKING_OPERATION_IN_FLIGHT_STATUSES = [
  "pending",
  "submitted",
  "compensating",
  "failed",
] as const satisfies readonly BookingOperationStatus[];

export const BOOKING_OPERATION_RECOVERABLE_STATUSES = [
  "pending",
  "submitted",
  "compensating",
] as const satisfies readonly BookingOperationStatus[];
