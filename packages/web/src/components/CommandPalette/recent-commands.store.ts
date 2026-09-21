import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  createExternalStore,
  subscribeToStorageKey,
} from "@web/common/utils/external-store.util";
import {
  MAX_RECENT_COMMANDS,
  readRecentCommandIds,
  writeRecentCommandIds,
} from "./recent-commands.storage";

const recentStore = createExternalStore<readonly string[]>(
  readRecentCommandIds(),
);

function refreshFromStorage(): void {
  recentStore.set(readRecentCommandIds());
}

/** Moves `id` to the front of the recent list, deduping and capping. */
export function recordRecentCommand(id: string): void {
  const next = [
    id,
    ...recentStore.get().filter((existing) => existing !== id),
  ].slice(0, MAX_RECENT_COMMANDS);
  if (writeRecentCommandIds(next)) recentStore.set(next);
}

function subscribe(onChange: () => void): () => void {
  const unsubscribeStore = recentStore.subscribe(onChange);
  const unsubscribeStorage = subscribeToStorageKey(
    STORAGE_KEYS.RECENT_COMMANDS,
    refreshFromStorage,
  );

  return () => {
    unsubscribeStore();
    unsubscribeStorage();
  };
}

export function useRecentCommandIds(): readonly string[] {
  return useSyncExternalStore(subscribe, recentStore.get);
}

/** Test-only: resyncs the in-memory store from storage. Registered in
 * reset-stores.ts for between-test cleanup. */
export function resetRecentCommandsStoreForTests(): void {
  refreshFromStorage();
}
