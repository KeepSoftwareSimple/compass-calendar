import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

const store = persistentBrowserStore;

let skipPointerHintForNextContextMenu = false;

/** Set before the `m` shortcut dispatches a synthetic contextmenu. */
export const markKeyboardContextMenuDispatch = (): void => {
  skipPointerHintForNextContextMenu = true;
};

export const consumeKeyboardContextMenuSkip = (): boolean => {
  if (!skipPointerHintForNextContextMenu) return false;
  skipPointerHintForNextContextMenu = false;
  return true;
};

export const readPointerHintDismissedPermanently = (): boolean =>
  store.get(STORAGE_KEYS.POINTER_HINT_DISMISSED_PERMANENTLY) === "true";

export const writePointerHintDismissedPermanently = () => {
  store.set(STORAGE_KEYS.POINTER_HINT_DISMISSED_PERMANENTLY, "true");
};

/** Test-only reset for the persisted "tips off" flag. */
export const resetPointerHintPersistenceForTests = () => {
  store.remove(STORAGE_KEYS.POINTER_HINT_DISMISSED_PERMANENTLY);
};

export const resetKeyboardContextMenuDispatchForTests = (): void => {
  skipPointerHintForNextContextMenu = false;
};
