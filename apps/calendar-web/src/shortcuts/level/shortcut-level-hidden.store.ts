import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createStorageBackedStore } from "@web/common/utils/external-store.util";

function readLevelHidden(): boolean {
  return (
    persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN) === "true"
  );
}

const hiddenStore = createStorageBackedStore(
  STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN,
  readLevelHidden,
);

/** Whether the sidebar shortcut level badge is hidden on this browser. */
export function useIsLevelHidden(): boolean {
  return useSyncExternalStore(
    hiddenStore.subscribe,
    hiddenStore.get,
    () => false,
  );
}

export function setLevelHidden(hidden: boolean): void {
  if (hidden) {
    persistentBrowserStore.set(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN, "true");
  } else {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN);
  }
  hiddenStore.refresh();
}

/** Test-only: resyncs the in-memory store from storage. */
export function resetShortcutLevelHiddenStoreForTests(): void {
  hiddenStore.refresh();
}
