import {
  type AdminGetBookingPageResponse,
  type AdminGetBookingPageSetupResponse,
  type AdminPutBookingPageInput,
  type BookingPage,
  BookingPageSchema,
  pickAdminPutBookingPageInput,
} from "@core/types/booking.contracts";
import { type BookingPageRecord } from "@backend/booking/booking-page.record";
import { CONFIG } from "@backend/common/constants/config.constants";

export const buildBookingUrl = (slug: string): string =>
  new URL(`/meet/${slug}`, CONFIG.FRONTEND_URL).href;

export const buildGuestActionUrl = (
  action: "cancel" | "reschedule",
  reservationId: string,
  token: string,
): string =>
  new URL(
    `/meet/${action}/${reservationId}?token=${encodeURIComponent(token)}`,
    CONFIG.FRONTEND_URL,
  ).href;

export const guestActionUrls = (reservationId: string, token: string) => ({
  cancelUrl: buildGuestActionUrl("cancel", reservationId, token),
  rescheduleUrl: buildGuestActionUrl("reschedule", reservationId, token),
});

export const mapBookingPageRecordToWire = (
  record: BookingPageRecord & { bookingSlug: string },
): BookingPage =>
  BookingPageSchema.parse({
    id: record._id.toString(),
    slug: record.bookingSlug,
    hostUserId: record.userId.toString(),
    enabled: record.enabled,
    durationMinutes: record.durationMinutes,
    destinationCalendarId: record.destinationCalendarId,
    blockingCalendarIds: record.blockingCalendarIds,
    timeZone: record.timeZone,
    weeklyAvailability: record.weeklyAvailability,
    minNoticeHours: record.minNoticeHours,
    maxHorizonDays: record.maxHorizonDays,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });

export const mapBookingPageRecordToAdminResponse = (
  record: BookingPageRecord & { bookingSlug: string },
): AdminGetBookingPageResponse => ({
  ...mapBookingPageRecordToWire(record),
  bookingUrl: buildBookingUrl(record.bookingSlug),
});

/**
 * A record that was saved but never enabled has no slug and no public URL.
 * isConfigured: true tells the client the host's stored timezone is a real
 * choice that must not be re-seeded from the calendar view.
 */
export const mapBookingPageRecordToSetupResponse = (
  record: Pick<
    BookingPageRecord,
    | "enabled"
    | "durationMinutes"
    | "destinationCalendarId"
    | "blockingCalendarIds"
    | "timeZone"
    | "weeklyAvailability"
    | "minNoticeHours"
    | "maxHorizonDays"
  >,
  suggestedSlug: string,
): AdminGetBookingPageSetupResponse => ({
  ...pickAdminPutBookingPageInput(record),
  isConfigured: true,
  suggestedSlug,
});

export const mapPutInputToRecordFields = (
  input: AdminPutBookingPageInput,
): Omit<
  BookingPageRecord,
  "_id" | "userId" | "bookingSlug" | "createdAt" | "updatedAt" | "hostNoticedAt"
> => {
  const { slug: _slug, ...withoutSlug } = input;
  return pickAdminPutBookingPageInput(withoutSlug);
};
