import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

export function hasDismissedTasksRemovalNotice(): boolean {
  if (!persistentBrowserStore.isAvailable()) return true;
  return (
    persistentBrowserStore.get(
      STORAGE_KEYS.HAS_DISMISSED_TASKS_REMOVAL_NOTICE,
    ) === "true"
  );
}

export function markTasksRemovalNoticeDismissed(): void {
  persistentBrowserStore.set(
    STORAGE_KEYS.HAS_DISMISSED_TASKS_REMOVAL_NOTICE,
    "true",
  );
}
