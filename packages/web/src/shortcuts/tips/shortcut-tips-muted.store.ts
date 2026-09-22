import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  createExternalStore,
  subscribeToStorageKey,
} from "@web/common/utils/external-store.util";

function readTipsMuted(): boolean {
  return (
    persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_TIPS_MUTED) === "true"
  );
}

const mutedStore = createExternalStore(readTipsMuted());

function refreshFromStorage(): void {
  mutedStore.set(readTipsMuted());
}

function subscribe(onChange: () => void): () => void {
  const unsubscribeStore = mutedStore.subscribe(onChange);
  const unsubscribeStorage = subscribeToStorageKey(
    STORAGE_KEYS.SHORTCUT_TIPS_MUTED,
    refreshFromStorage,
  );

  return () => {
    unsubscribeStore();
    unsubscribeStorage();
  };
}

export function useIsTipsMuted(): boolean {
  return useSyncExternalStore(subscribe, mutedStore.get, () => false);
}

export function setTipsMuted(muted: boolean): void {
  if (muted) {
    persistentBrowserStore.set(STORAGE_KEYS.SHORTCUT_TIPS_MUTED, "true");
  } else {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_TIPS_MUTED);
  }
  mutedStore.set(readTipsMuted());
}

/** Test-only: resyncs the in-memory store from storage. */
export function resetShortcutTipsMutedStoreForTests(): void {
  refreshFromStorage();
}
