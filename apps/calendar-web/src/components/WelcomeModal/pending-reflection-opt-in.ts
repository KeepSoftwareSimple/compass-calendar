import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

/** Remember the sign-up toggle across the OAuth redirect. */
export function setPendingReflectionOptIn(optedIn: boolean): void {
  if (optedIn)
    persistentBrowserStore.set(STORAGE_KEYS.PENDING_REFLECTION_OPT_IN, "true");
  else persistentBrowserStore.remove(STORAGE_KEYS.PENDING_REFLECTION_OPT_IN);
}

/** Read and clear the choice so it is applied exactly once. */
export function takePendingReflectionOptIn(): boolean {
  if (!persistentBrowserStore.isAvailable()) return false;
  const optedIn =
    persistentBrowserStore.get(STORAGE_KEYS.PENDING_REFLECTION_OPT_IN) ===
    "true";
  persistentBrowserStore.remove(STORAGE_KEYS.PENDING_REFLECTION_OPT_IN);
  return optedIn;
}
