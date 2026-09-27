import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

export function hasDismissedMeetingPageNudge(): boolean {
  if (!persistentBrowserStore.isAvailable()) return true;
  return (
    persistentBrowserStore.get(
      STORAGE_KEYS.HAS_DISMISSED_MEETING_PAGE_NUDGE,
    ) === "true"
  );
}

export function markMeetingPageNudgeDismissed(): void {
  persistentBrowserStore.set(
    STORAGE_KEYS.HAS_DISMISSED_MEETING_PAGE_NUDGE,
    "true",
  );
}
