import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createStorageBackedStore } from "@web/common/utils/external-store.util";

function readTipsMuted(): boolean {
  return (
    persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_TIPS_MUTED) === "true"
  );
}

const mutedStore = createStorageBackedStore(
  STORAGE_KEYS.SHORTCUT_TIPS_MUTED,
  readTipsMuted,
);

export function useIsTipsMuted(): boolean {
  return useSyncExternalStore(
    mutedStore.subscribe,
    mutedStore.get,
    () => false,
  );
}

export function setTipsMuted(muted: boolean): void {
  if (muted) {
    persistentBrowserStore.set(STORAGE_KEYS.SHORTCUT_TIPS_MUTED, "true");
  } else {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_TIPS_MUTED);
  }
  mutedStore.refresh();
}

/** Test-only: resyncs the in-memory store from storage. */
export function resetShortcutTipsMutedStoreForTests(): void {
  mutedStore.refresh();
}
