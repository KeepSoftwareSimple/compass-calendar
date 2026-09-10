import {
  type AdminGetBookingPageResult,
  type AdminPutBookingPageInput,
  BOOKING_PLACEHOLDER_CALENDAR_ID,
  type BookingDurationMinutes,
  BookingSlugSchema,
  pickAdminPutBookingPageInput,
  type WeeklyAvailabilityInterval,
} from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type BookingField } from "@web/booking/booking-sequence.fields";
import { getLocalCalendar } from "@web/calendars/calendar.util";

export const BOOKING_AVAILABILITY_REQUIRED_MESSAGE =
  "Add weekly hours before turning on your meeting page.";

export const BOOKING_DURATION_OPTIONS: readonly BookingDurationMinutes[] = [
  15, 30, 45, 60,
];

export function getAvailabilityReadableCalendars(
  calendars: Calendar[],
): Calendar[] {
  return calendars.filter(
    (calendar) =>
      calendar.isActive && calendar.capabilities.canReadAvailability,
  );
}

export function defaultBlockingCalendarIdsForDestination(
  destinationCalendarId: CalendarId,
  calendars: Calendar[],
): CalendarId[] {
  const readable = getAvailabilityReadableCalendars(calendars);
  const destination = calendars.find(
    (calendar) => calendar.id === destinationCalendarId,
  );
  const accountEmail = destination?.accountEmail;
  const ids: CalendarId[] =
    accountEmail === undefined
      ? [destinationCalendarId]
      : readable
          .filter(
            (calendar) =>
              calendar.accountEmail?.toLowerCase() ===
              accountEmail.toLowerCase(),
          )
          .map((calendar) => calendar.id);
  const blockingIds = ids.length > 0 ? ids : [destinationCalendarId];
  const local = getLocalCalendar(readable);
  if (local && !blockingIds.includes(local.id)) {
    blockingIds.push(local.id);
  }
  return blockingIds;
}

export function isPlaceholderDestinationCalendar(
  calendarId: CalendarId,
): boolean {
  return calendarId === BOOKING_PLACEHOLDER_CALENDAR_ID;
}

export function canEnableBookingPage(
  input: AdminPutBookingPageInput,
  writableCalendars: Calendar[],
): boolean {
  if (isPlaceholderDestinationCalendar(input.destinationCalendarId)) {
    return false;
  }
  return writableCalendars.some(
    (calendar) => calendar.id === input.destinationCalendarId,
  );
}

const WEEKDAY_LABELS: Record<WeeklyAvailabilityInterval["weekday"], string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export function weekdayLabel(weekday: WeeklyAvailabilityInterval["weekday"]) {
  return WEEKDAY_LABELS[weekday];
}

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type IsoWeekday = (typeof ISO_WEEKDAYS)[number];

const WEEKDAY_SHORT_LABELS: Record<IsoWeekday, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

export function weekdayShortLabel(weekday: IsoWeekday) {
  return WEEKDAY_SHORT_LABELS[weekday];
}

/**
 * The PUT body, and only the PUT body.
 *
 * `GET /booking/page` answers with the saved page once a slug exists, which
 * carries `id`, `slug`, `hostUserId`, `createdAt`, `updatedAt` and
 * `bookingUrl` on top of the input fields. `AdminPutBookingPageInputSchema` is
 * a `z.strictObject`, so spreading that response into form state made every
 * save after the first throw on the unknown keys before any request went out.
 * Pick the fields explicitly so a response-only key can never ride along.
 */
export function toBookingPageInput(
  page: AdminPutBookingPageInput,
): AdminPutBookingPageInput {
  return pickAdminPutBookingPageInput(page);
}

/**
 * Compare the live Settings form against the last seeded page. Number fields
 * keep raw text until parse succeeds, so an in-progress (or cleared) value
 * counts as dirty even when `form.minNoticeHours` / `form.maxHorizonDays`
 * still hold the previous integer.
 */
export function isBookingSettingsFormDirty({
  form,
  baseline,
  minNoticeText,
  horizonText,
}: {
  form: AdminPutBookingPageInput;
  baseline: AdminPutBookingPageInput;
  minNoticeText: string;
  horizonText: string;
}): boolean {
  if (
    JSON.stringify(toBookingPageInput(form)) !==
    JSON.stringify(toBookingPageInput(baseline))
  ) {
    return true;
  }
  return (
    minNoticeText !== String(baseline.minNoticeHours) ||
    horizonText !== String(baseline.maxHorizonDays)
  );
}

/**
 * A page the host has never saved. `GET /booking/page` answers with the same
 * bare input shape whether the host never saved or saved without ever
 * enabling, so the explicit flag is the only way to tell them apart - and the
 * difference decides whether the client may overwrite the timezone.
 */
export function isUnconfiguredBookingPage(
  page: AdminGetBookingPageResult,
): boolean {
  return "isConfigured" in page && page.isConfigured === false;
}

/** Live pages carry `slug`; setup pages carry the suggestion (or a draft). */
export function slugFromAdminBookingPage(
  page: AdminGetBookingPageResult,
): string {
  if ("suggestedSlug" in page) {
    return page.suggestedSlug;
  }
  return page.slug;
}

const BOOKING_SLUG_FALLBACK_MESSAGE =
  "Use 3 to 32 lowercase letters, digits, or hyphens";

/**
 * The first schema complaint about a slug, or null when it parses. The address
 * field shows this on blur and the save path reuses it, so the inline hint and
 * the save error can never disagree.
 */
export function bookingSlugParseMessage(
  slug: string | undefined,
): string | null {
  const parsed = BookingSlugSchema.safeParse(slug);
  if (parsed.success) {
    return null;
  }
  return parsed.error.issues[0]?.message ?? BOOKING_SLUG_FALLBACK_MESSAGE;
}

export type BookingFormValidationError = {
  message: string;
  field?: BookingField;
};

export function validateBookingForm({
  enabling,
  form,
  horizonInvalid,
  minNoticeInvalid,
  writableCalendars,
}: {
  enabling: boolean;
  form: AdminPutBookingPageInput;
  horizonInvalid: boolean;
  minNoticeInvalid: boolean;
  writableCalendars: Calendar[];
}): BookingFormValidationError | null {
  const slugMessage = bookingSlugParseMessage(form.slug);
  if (slugMessage) {
    return { field: "address", message: slugMessage };
  }
  if (minNoticeInvalid) {
    return {
      field: "notice",
      message: "Fix the highlighted number fields before saving.",
    };
  }
  if (horizonInvalid) {
    return {
      field: "horizon",
      message: "Fix the highlighted number fields before saving.",
    };
  }
  if (enabling && !canEnableBookingPage(form, writableCalendars)) {
    return {
      field: "destination",
      message:
        "Choose a destination calendar before enabling your meeting page.",
    };
  }
  if (enabling && form.blockingCalendarIds.length === 0) {
    return {
      field: "blocking",
      message: "Select at least one blocking calendar.",
    };
  }
  if (enabling && form.weeklyAvailability.length === 0) {
    return {
      field: "hours",
      message: BOOKING_AVAILABILITY_REQUIRED_MESSAGE,
    };
  }
  return null;
}
