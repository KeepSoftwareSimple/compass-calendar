import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

/** Remember the sign-up toggle across the OAuth redirect. */
export function setPendingReflectionOptIn(optedIn: boolean): void {
  if (optedIn)
    persistentBrowserStore.set(STORAGE_KEYS.PENDING_REFLECTION_OPT_IN, "true");
  else persistentBrowserStore.remove(STORAGE_KEYS.PENDING_REFLECTION_OPT_IN);
}

/** Whether sign-up asked for reflections and the choice is not applied yet. */
export function peekPendingReflectionOptIn(): boolean {
  return (
    persistentBrowserStore.isAvailable() &&
    persistentBrowserStore.get(STORAGE_KEYS.PENDING_REFLECTION_OPT_IN) ===
      "true"
  );
}

/** Forget the choice once it has been saved, so it is applied exactly once. */
export function clearPendingReflectionOptIn(): void {
  persistentBrowserStore.remove(STORAGE_KEYS.PENDING_REFLECTION_OPT_IN);
}
