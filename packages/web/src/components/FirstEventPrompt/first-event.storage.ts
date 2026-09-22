import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

export type FirstEventDoneReason = "completed" | "dismissed";

export function getFirstEventDone(): FirstEventDoneReason | null {
  if (!persistentBrowserStore.isAvailable()) return null;
  const value = persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE);
  if (value === "completed" || value === "dismissed") return value;
  return null;
}

export function markFirstEventDone(reason: FirstEventDoneReason): void {
  persistentBrowserStore.set(STORAGE_KEYS.FIRST_EVENT_DONE, reason);
}
