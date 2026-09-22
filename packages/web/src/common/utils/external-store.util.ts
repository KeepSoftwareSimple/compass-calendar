/**
 *
 * Minimal mutable value container designed for React's `useSyncExternalStore`.
 * Read it imperatively with `get()`, update it with `set()`, and observe it via
 * `subscribe()` (which returns an unsubscribe function).
 *
 * Usage in a component/hook:
 *   useSyncExternalStore(store.subscribe, store.get)
 */
interface ExternalStore<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (onChange: () => void) => () => void;
}

export function createExternalStore<T>(initial: T): ExternalStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;

      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (onChange) => {
      listeners.add(onChange);

      return () => void listeners.delete(onChange);
    },
  };
}

/**
 * Cross-tab sync for a single localStorage key: a write in another tab fires
 * "storage" here (browsers never fire it in the writing tab itself), so this
 * calls `onChange` to let the caller re-read its own source of truth. Shared
 * by every store that mirrors one localStorage key (auth state, calendar
 * visibility) so the window-listener wiring exists in one place.
 */
export function subscribeToStorageKey(
  key: string,
  onChange: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) onChange();
  };
  window.addEventListener("storage", handleStorage);

  return () => window.removeEventListener("storage", handleStorage);
}

/**
 * An `ExternalStore` that mirrors one localStorage key. `subscribe` is ready
 * to hand to `useSyncExternalStore`: it observes both in-tab writes and
 * another tab's write to the same key.
 */
export interface StorageBackedStore<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (onChange: () => void) => () => void;
  /** Re-reads the key and publishes the result. */
  refresh: () => void;
}

/**
 * The shape every store that mirrors a single localStorage key repeats: an
 * in-memory container seeded from `read()`, a refresh that re-reads it, and a
 * `useSyncExternalStore` subscribe that combines the container's own listeners
 * with the cross-tab "storage" event for `key`.
 *
 * Storage stays the source of truth; the store only makes changes to it
 * observable. Writers still write through their own storage module and then
 * `set()` the value they wrote, so a failed write leaves the store untouched.
 * `refresh` is what a test-only reset hook calls to resync after seeding
 * storage directly.
 */
export function createStorageBackedStore<T>(
  key: string,
  read: () => T,
): StorageBackedStore<T> {
  const store = createExternalStore(read());
  const refresh = () => store.set(read());

  return {
    get: store.get,
    set: store.set,
    refresh,
    subscribe: (onChange) => {
      const unsubscribeStore = store.subscribe(onChange);
      const unsubscribeStorage = subscribeToStorageKey(key, refresh);

      return () => {
        unsubscribeStore();
        unsubscribeStorage();
      };
    },
  };
}
