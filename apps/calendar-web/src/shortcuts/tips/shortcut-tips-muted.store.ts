import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { createBooleanPreferenceStore } from "@web/common/storage/boolean-preference.store";

const mutedStore = createBooleanPreferenceStore(
  STORAGE_KEYS.SHORTCUT_TIPS_MUTED,
);

export function useIsTipsMuted(): boolean {
  return useSyncExternalStore(
    mutedStore.subscribe,
    mutedStore.get,
    () => false,
  );
}

export function setTipsMuted(muted: boolean): void {
  mutedStore.set(muted);
}

export function readTipsMuted(): boolean {
  return mutedStore.get();
}

/** Test-only: resyncs the in-memory store from storage. */
export function resetShortcutTipsMutedStoreForTests(): void {
  mutedStore.refresh();
}
