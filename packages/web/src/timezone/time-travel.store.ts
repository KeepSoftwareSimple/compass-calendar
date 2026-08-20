import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  createExternalStore,
  subscribeToStorageKey,
} from "@web/common/utils/external-store.util";
import { isValidTimeZone } from "@web/timezone/browser-timezone";

function readTimeTravelZone(): string | null {
  const raw = persistentBrowserStore.get(STORAGE_KEYS.TIME_TRAVEL_TIMEZONE);
  if (!raw || raw.trim().length === 0 || !isValidTimeZone(raw)) {
    return null;
  }
  return raw;
}

const timeTravelZoneStore = createExternalStore<string | null>(
  readTimeTravelZone(),
);

function refreshFromStorage(): void {
  timeTravelZoneStore.set(readTimeTravelZone());
}

export function getTimeTravelZone(): string | null {
  return timeTravelZoneStore.get();
}

/**
 * Pin a secondary read-only hour column, or pass null to dismiss it.
 * Returns false when the storage write fails, leaving the previous zone.
 */
export function setTimeTravelZone(timeZone: string | null): boolean {
  if (timeZone !== null && !isValidTimeZone(timeZone)) {
    return false;
  }

  const saved =
    timeZone === null
      ? persistentBrowserStore.remove(STORAGE_KEYS.TIME_TRAVEL_TIMEZONE)
      : persistentBrowserStore.set(STORAGE_KEYS.TIME_TRAVEL_TIMEZONE, timeZone);

  if (saved) {
    timeTravelZoneStore.set(timeZone);
  }
  return saved;
}

function subscribe(onChange: () => void): () => void {
  const unsubscribeStore = timeTravelZoneStore.subscribe(onChange);
  const unsubscribeStorage = subscribeToStorageKey(
    STORAGE_KEYS.TIME_TRAVEL_TIMEZONE,
    refreshFromStorage,
  );

  return () => {
    unsubscribeStore();
    unsubscribeStorage();
  };
}

export function useTimeTravelZone(): string | null {
  return useSyncExternalStore(subscribe, getTimeTravelZone);
}

export function resetTimeTravelStoreForTests(): void {
  persistentBrowserStore.remove(STORAGE_KEYS.TIME_TRAVEL_TIMEZONE);
  timeTravelZoneStore.set(null);
}
