import { z } from "zod/v4";
import {
  BOOKING_MAX_HORIZON_DAYS,
  BOOKING_MAX_MIN_NOTICE_HOURS,
  BookingDurationMinutesSchema,
  BookingSlugSchema,
  WeeklyAvailabilitySchema,
} from "@core/types/booking.contracts";
import {
  CalendarIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { zObjectId } from "@core/types/type.utils";

const ObjectIdSchema = zObjectId;

// Existing documents may still store leftover keys from removed host settings
// (`welcomeText`, `bufferMinutes`, `maxBookingsPerDay`, `guestsCanInviteOthers`,
// or `dateOverrides`); they are unused leftover storage, not live fields.
// `z.object` strips unknown keys so those documents still parse.
export const BookingPageRecordSchema = z.object({
  _id: ObjectIdSchema,
  userId: ObjectIdSchema,
  bookingSlug: BookingSlugSchema.optional(),
  enabled: z.boolean(),
  durationMinutes: BookingDurationMinutesSchema,
  destinationCalendarId: CalendarIdSchema,
  blockingCalendarIds: z.array(CalendarIdSchema).min(1).readonly(),
  timeZone: TimeZoneSchema,
  weeklyAvailability: WeeklyAvailabilitySchema,
  minNoticeHours: z
    .number()
    .int()
    .nonnegative()
    .max(BOOKING_MAX_MIN_NOTICE_HOURS),
  maxHorizonDays: z.number().int().positive().max(BOOKING_MAX_HORIZON_DAYS),
  createdAt: z.date(),
  updatedAt: z.date(),
  hostNoticedAt: z.date().optional(),
});
export type BookingPageRecord = z.infer<typeof BookingPageRecordSchema>;
