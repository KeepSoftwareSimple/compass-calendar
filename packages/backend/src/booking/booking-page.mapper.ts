import {
  type AdminGetBookingPageResponse,
  type AdminGetBookingPageSetupResponse,
  type AdminPutBookingPageInput,
  type BookingMeetingTypes,
  type BookingPage,
  BookingPageSchema,
  defaultMeetingTypeLabel,
  defaultMeetingTypes,
  pickAdminPutBookingPageInput,
  resolveBookingMeetingTypes,
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
    meetingTypes: resolveBookingMeetingTypes(record),
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
    | "meetingTypes"
    | "destinationCalendarId"
    | "blockingCalendarIds"
    | "timeZone"
    | "weeklyAvailability"
    | "minNoticeHours"
    | "maxHorizonDays"
  >,
  suggestedSlug: string,
): AdminGetBookingPageSetupResponse => ({
  ...pickAdminPutBookingPageInput({
    ...record,
    meetingTypes: resolveBookingMeetingTypes(record),
  }),
  isConfigured: true,
  suggestedSlug,
});

/**
 * The meeting types a PUT stores. Clients that predate meeting types send
 * only `durationMinutes`: keep the stored types and move type #1 to that
 * duration, renaming it only while it still carries the default label.
 */
export const meetingTypesForPut = (
  input: Pick<AdminPutBookingPageInput, "durationMinutes" | "meetingTypes">,
  existing:
    | Pick<BookingPageRecord, "durationMinutes" | "meetingTypes">
    | null
    | undefined,
): BookingMeetingTypes => {
  if (input.meetingTypes) {
    return input.meetingTypes;
  }
  const current = existing
    ? resolveBookingMeetingTypes(existing)
    : defaultMeetingTypes(input.durationMinutes);
  const [first, ...rest] = current;
  if (!first || first.durationMinutes === input.durationMinutes) {
    return current;
  }
  const label =
    first.label === defaultMeetingTypeLabel(first.durationMinutes)
      ? defaultMeetingTypeLabel(input.durationMinutes)
      : first.label;
  return [{ ...first, label, durationMinutes: input.durationMinutes }, ...rest];
};

export const mapPutInputToRecordFields = (
  input: AdminPutBookingPageInput,
  existing?: Pick<BookingPageRecord, "durationMinutes" | "meetingTypes"> | null,
): Omit<
  BookingPageRecord,
  | "_id"
  | "userId"
  | "bookingSlug"
  | "createdAt"
  | "updatedAt"
  | "hostNoticedAt"
  | "hostNoticedReservationId"
> => {
  const { slug: _slug, ...withoutSlug } = input;
  const meetingTypes = meetingTypesForPut(input, existing);
  const first = meetingTypes[0];
  return pickAdminPutBookingPageInput({
    ...withoutSlug,
    durationMinutes: first ? first.durationMinutes : input.durationMinutes,
    meetingTypes,
  });
};
