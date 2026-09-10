import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  createExternalStore,
  subscribeToStorageKey,
} from "@web/common/utils/external-store.util";
import {
  readCollapsedAccountKeys,
  writeCollapsedAccountKeys,
} from "./collapsed-accounts.storage";

/**
 * Deterministic id shared between an account's heading (aria-controls) and
 * its calendar list (id) - the two are separate sibling components, so this
 * can't be a useId(). Keys are `accountKey` values (calendar.util.ts).
 */
export function accountCalendarListId(accountKey: string): string {
  return `account-calendars-${accountKey}`;
}

const collapsedStore = createExternalStore<ReadonlySet<string>>(
  readCollapsedAccountKeys(),
);

function refreshFromStorage(): void {
  collapsedStore.set(readCollapsedAccountKeys());
}

/**
 * Toggle one account's collapsed state. Returns false (leaving the store
 * untouched) if the storage write fails.
 */
export function toggleAccountCollapsed(key: string): boolean {
  const next = new Set(collapsedStore.get());
  if (next.has(key)) next.delete(key);
  else next.add(key);

  const saved = writeCollapsedAccountKeys(next);
  if (saved) collapsedStore.set(next);
  return saved;
}

function subscribe(onChange: () => void): () => void {
  const unsubscribeStore = collapsedStore.subscribe(onChange);
  const unsubscribeStorage = subscribeToStorageKey(
    STORAGE_KEYS.COLLAPSED_ACCOUNTS,
    refreshFromStorage,
  );

  return () => {
    unsubscribeStore();
    unsubscribeStorage();
  };
}

export function useCollapsedAccountKeys(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, collapsedStore.get);
}

/** Test-only: resyncs the in-memory store from storage. Registered in
 * reset-stores.ts for between-test cleanup. */
export function resetCollapsedAccountsStoreForTests(): void {
  refreshFromStorage();
}
