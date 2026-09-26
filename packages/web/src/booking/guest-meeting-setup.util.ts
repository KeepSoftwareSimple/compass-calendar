import {
  type AdminPutBookingPageInput,
  AdminPutBookingPageInputSchema,
} from "@core/types/booking.contracts";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

export const MEETING_SETUP_SEARCH_PARAM = "meetingSetup";

export function readGuestMeetingSetupDraft(): AdminPutBookingPageInput | null {
  if (!persistentBrowserStore.isAvailable()) return null;
  const raw = persistentBrowserStore.get(
    STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT,
  );
  if (!raw) return null;
  try {
    return AdminPutBookingPageInputSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeGuestMeetingSetupDraft(
  form: AdminPutBookingPageInput,
): void {
  if (!persistentBrowserStore.isAvailable()) return;
  persistentBrowserStore.set(
    STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT,
    JSON.stringify(form),
  );
}

export function clearGuestMeetingSetupDraft(): void {
  if (!persistentBrowserStore.isAvailable()) return;
  persistentBrowserStore.remove(STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT);
}
