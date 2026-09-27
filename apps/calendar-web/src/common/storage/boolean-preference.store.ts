import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  createStorageBackedStore,
  type StorageBackedStore,
} from "@web/common/utils/external-store.util";

/**
 * An opt-in flag kept in localStorage, where the key is present as `"true"`
 * when on and absent when off, so a browser that has never touched the
 * preference reads the same as one that turned it back off.
 *
 * Hand `subscribe` and `get` to `useSyncExternalStore` in the owning module's
 * own hook, `set` to its writer, and `refresh` to its test-only reset. The
 * pattern is shared rather than repeated because the read, the
 * set-or-remove branch, and the republish have to agree on what absent
 * means.
 */
export function createBooleanPreferenceStore(
  key: string,
): StorageBackedStore<boolean> {
  const store = createStorageBackedStore(
    key,
    () => persistentBrowserStore.get(key) === "true",
  );

  return {
    ...store,
    /** Writes storage first, so a rejected write leaves the store untouched. */
    set: (next: boolean) => {
      if (next) persistentBrowserStore.set(key, "true");
      else persistentBrowserStore.remove(key);
      store.refresh();
    },
  };
}
