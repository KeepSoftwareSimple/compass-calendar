import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

export function readSidebarOpen(): boolean {
  return persistentBrowserStore.get(STORAGE_KEYS.SIDEBAR_OPEN) !== "false";
}

export function writeSidebarOpen(isOpen: boolean): void {
  persistentBrowserStore.set(STORAGE_KEYS.SIDEBAR_OPEN, String(isOpen));
}
