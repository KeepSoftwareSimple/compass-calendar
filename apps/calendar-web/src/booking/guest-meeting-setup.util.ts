import {
  type AdminPutBookingPageInput,
  AdminPutBookingPageInputSchema,
} from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { defaultBlockingCalendarIdsForDestination } from "@web/booking/booking.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  readJsonValue,
  writeJsonValue,
} from "@web/common/storage/json-value.store";

/**
 * The wizard draft an anonymous visitor builds before signing up. Storage
 * failures and a draft this build's schema no longer accepts both read back
 * as "no draft": the section then seeds from defaults rather than throwing
 * into the render.
 */
export function readGuestMeetingSetupDraft(): AdminPutBookingPageInput | null {
  return readJsonValue(
    STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT,
    AdminPutBookingPageInputSchema.nullable(),
    null,
  );
}

export function writeGuestMeetingSetupDraft(
  form: AdminPutBookingPageInput,
): void {
  writeJsonValue(STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT, form);
}

export function clearGuestMeetingSetupDraft(): void {
  persistentBrowserStore.remove(STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT);
}

/** Hydrates a persisted guest draft after sign-up, with a writable destination. */
export function prepareGuestMeetingSetupResume(
  draft: AdminPutBookingPageInput,
  writableCalendars: Calendar[],
  availabilityCalendars: Calendar[],
): AdminPutBookingPageInput {
  const destinationCalendarId =
    writableCalendars[0]?.id ?? draft.destinationCalendarId;
  return {
    ...draft,
    destinationCalendarId,
    blockingCalendarIds: defaultBlockingCalendarIdsForDestination(
      destinationCalendarId,
      availabilityCalendars,
    ),
  };
}
