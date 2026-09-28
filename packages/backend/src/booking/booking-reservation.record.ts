import { z } from "zod/v4";
import { BookingReservationStatusSchema } from "@core/types/booking.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { zObjectId } from "@core/types/object-id.schema";

const ObjectIdSchema = zObjectId;

export const BookingGuestActionSchema = z.enum([
  "booked",
  "cancelled",
  "rescheduled",
]);
export type BookingGuestAction = z.infer<typeof BookingGuestActionSchema>;

export const BookingReservationRecordSchema = z.strictObject({
  _id: ObjectIdSchema,
  pageId: ObjectIdSchema,
  slotStart: z.date(),
  slotEnd: z.date(),
  guestName: z.string().trim().min(1).max(256),
  guestEmail: z.string().trim().min(1).max(320),
  notes: z.string().trim().max(4000).nullable(),
  guestTimeZone: TimeZoneSchema,
  status: BookingReservationStatusSchema,
  calendarEventId: z.string().trim().min(1).max(256).nullable(),
  cancelTokenHash: z.string().trim().min(1).max(256),
  lastGuestActionAt: z.date().optional(),
  lastGuestAction: BookingGuestActionSchema.optional(),
  previousSlotStart: z.date().optional(),
  previousSlotEnd: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type BookingReservationRecord = z.infer<
  typeof BookingReservationRecordSchema
>;
