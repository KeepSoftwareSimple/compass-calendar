import {
  type AdminGetBookingPageResult,
  type AdminPutBookingPageInput,
  BOOKING_MAX_HORIZON_DAYS,
  BOOKING_MAX_MIN_NOTICE_HOURS,
  BOOKING_PLACEHOLDER_CALENDAR_ID,
  buildDefaultAdminPutInput,
  isSavedBookingPage,
} from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import {
  defaultBlockingCalendarIdsForDestination,
  isConfiguredBookingPage,
  isPlaceholderDestinationCalendar,
  slugFromAdminBookingPage,
  toBookingPageInput,
} from "@web/booking/booking.util";
import { bookingAddressPrefix } from "@web/booking/booking-address.util";

/** Public URL for a saved page that is currently off. Typed-but-unsaved slugs never qualify. */
export function savedMeetingLinkUrl(
  page: AdminGetBookingPageResult | undefined,
): string | null {
  if (!page) return null;
  if (isSavedBookingPage(page)) {
    return page.enabled === true ? null : page.bookingUrl;
  }
  if (page.isConfigured) {
    return `${bookingAddressPrefix(null)}${page.suggestedSlug}`;
  }
  return null;
}

/**
 * The number fields keep their own text state so a half-typed value survives
 * a re-render; null means "not a whole number in range" and is what both the
 * invalid styling and the save guard read.
 */
export function parseBookingCount(
  raw: string,
  { min, max }: { min: number; max: number },
): number | null {
  if (raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

export const MIN_NOTICE_BOUNDS = { min: 0, max: BOOKING_MAX_MIN_NOTICE_HOURS };
export const HORIZON_BOUNDS = { min: 1, max: BOOKING_MAX_HORIZON_DAYS };

/**
 * The form the section starts from: the server page when there is one, else
 * this browser's defaults. A destination the host cannot write to, and a
 * blocking list that is still the placeholder, fall back to the calendars we
 * did discover, so an unconfigured page opens on something savable.
 */
export function buildInitialForm(
  page: AdminGetBookingPageResult | undefined,
  effectiveTimeZone: string,
  writableCalendars: Calendar[],
  availabilityCalendars: Calendar[],
): AdminPutBookingPageInput {
  const base =
    page ?? buildDefaultAdminPutInput(TimeZoneSchema.parse(effectiveTimeZone));

  const destinationCalendarId =
    !isPlaceholderDestinationCalendar(base.destinationCalendarId) &&
    (writableCalendars.some(
      (calendar) => calendar.id === base.destinationCalendarId,
    ) ||
      writableCalendars.length === 0)
      ? base.destinationCalendarId
      : (writableCalendars[0]?.id ?? BOOKING_PLACEHOLDER_CALENDAR_ID);

  const blockingCalendarIds =
    base.blockingCalendarIds.length > 0 &&
    !base.blockingCalendarIds.every(isPlaceholderDestinationCalendar)
      ? base.blockingCalendarIds
      : defaultBlockingCalendarIdsForDestination(
          destinationCalendarId,
          availabilityCalendars,
        );

  const timeZone = isConfiguredBookingPage(page)
    ? base.timeZone
    : effectiveTimeZone;

  const slug = page ? slugFromAdminBookingPage(page) : undefined;

  return {
    ...toBookingPageInput({
      ...base,
      ...(slug !== undefined ? { slug } : {}),
    }),
    destinationCalendarId,
    blockingCalendarIds,
    timeZone: TimeZoneSchema.parse(timeZone || effectiveTimeZone),
  };
}
