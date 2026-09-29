import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

const store = persistentBrowserStore;

export const readPointerHintDismissedPermanently = (): boolean =>
  store.get(STORAGE_KEYS.POINTER_HINT_DISMISSED_PERMANENTLY) === "true";

export const writePointerHintDismissedPermanently = () => {
  store.set(STORAGE_KEYS.POINTER_HINT_DISMISSED_PERMANENTLY, "true");
};

/** Test-only reset for the persisted "tips off" flag. */
export const resetPointerHintPersistenceForTests = () => {
  store.remove(STORAGE_KEYS.POINTER_HINT_DISMISSED_PERMANENTLY);
};
