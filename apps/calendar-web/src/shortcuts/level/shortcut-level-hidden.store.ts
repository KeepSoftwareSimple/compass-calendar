import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { createBooleanPreferenceStore } from "@web/common/storage/boolean-preference.store";

const hiddenStore = createBooleanPreferenceStore(
  STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN,
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
  hiddenStore.set(hidden);
}

/** Test-only: resyncs the in-memory store from storage. */
export function resetShortcutLevelHiddenStoreForTests(): void {
  hiddenStore.refresh();
}
