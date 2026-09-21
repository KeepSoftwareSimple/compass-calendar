import { z } from "zod/v4";
import { BookingReservationStatusSchema } from "@core/types/booking.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { zObjectId } from "@core/types/object-id.schema";

const ObjectIdSchema = zObjectId;

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
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type BookingReservationRecord = z.infer<
  typeof BookingReservationRecordSchema
>;
