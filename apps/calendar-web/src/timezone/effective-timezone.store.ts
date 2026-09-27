import { useSyncExternalStore } from "react";
import dayjs from "@core/util/date/dayjs";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  createExternalStore,
  subscribeToStorageKey,
} from "@web/common/utils/external-store.util";
import {
  getBrowserTimeZone,
  isValidTimeZone,
} from "@web/timezone/browser-timezone";
import { resetTimezoneMismatchSnoozeForTests } from "@web/timezone/timezone-mismatch";

function readPinnedTimeZone(): string | null {
  const raw = persistentBrowserStore.get(STORAGE_KEYS.DEFAULT_TIMEZONE);
  if (!raw || raw.trim().length === 0 || !isValidTimeZone(raw)) {
    return null;
  }
  return raw;
}

const pinnedTimeZoneStore = createExternalStore<string | null>(
  readPinnedTimeZone(),
);
const browserTimeZoneStore = createExternalStore(getBrowserTimeZone());

function applyDayjsDefault(timeZone: string): void {
  dayjs.setDefaultTimezone(timeZone);
}

function currentEffectiveTimeZone(): string {
  return pinnedTimeZoneStore.get() ?? browserTimeZoneStore.get();
}

function syncEffectiveTimeZone(): void {
  applyDayjsDefault(currentEffectiveTimeZone());
}

syncEffectiveTimeZone();

function refreshPinnedFromStorage(): void {
  pinnedTimeZoneStore.set(readPinnedTimeZone());
  syncEffectiveTimeZone();
}

export function getPinnedTimeZone(): string | null {
  return pinnedTimeZoneStore.get();
}

export function getEffectiveTimeZone(): string {
  return currentEffectiveTimeZone();
}

/**
 * Refresh the tracked browser zone. The effective zone only follows this
 * value in Auto mode (no pin).
 */
export function refreshEffectiveTimeZoneFromBrowser(): void {
  browserTimeZoneStore.set(getBrowserTimeZone());
  if (pinnedTimeZoneStore.get() === null) {
    syncEffectiveTimeZone();
  }
}

/**
 * Pin an IANA zone, or pass null to return to Auto. Returns false when the
 * storage write fails, leaving the previous preference in place.
 */
export function setPinnedTimeZone(timeZone: string | null): boolean {
  if (timeZone !== null && !isValidTimeZone(timeZone)) {
    return false;
  }

  const saved =
    timeZone === null
      ? persistentBrowserStore.remove(STORAGE_KEYS.DEFAULT_TIMEZONE)
      : persistentBrowserStore.set(STORAGE_KEYS.DEFAULT_TIMEZONE, timeZone);

  if (saved) {
    pinnedTimeZoneStore.set(timeZone);
    syncEffectiveTimeZone();
  }
  return saved;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshEffectiveTimeZoneFromBrowser();
    }
  });
}

function subscribe(onChange: () => void): () => void {
  const unsubscribePinned = pinnedTimeZoneStore.subscribe(onChange);
  const unsubscribeBrowser = browserTimeZoneStore.subscribe(onChange);
  const unsubscribeStorage = subscribeToStorageKey(
    STORAGE_KEYS.DEFAULT_TIMEZONE,
    refreshPinnedFromStorage,
  );

  return () => {
    unsubscribePinned();
    unsubscribeBrowser();
    unsubscribeStorage();
  };
}

export function useEffectiveTimeZone(): string {
  return useSyncExternalStore(subscribe, getEffectiveTimeZone);
}

export function usePinnedTimeZone(): string | null {
  return useSyncExternalStore(subscribe, getPinnedTimeZone);
}

function getStoredBrowserTimeZone(): string {
  return browserTimeZoneStore.get();
}

export function useBrowserTimeZone(): string {
  return useSyncExternalStore(subscribe, getStoredBrowserTimeZone);
}

/** Test-only: pin in memory (and storage when available) without extra UI. */
export function setEffectiveTimeZoneForTests(timeZone: string): void {
  setPinnedTimeZone(timeZone);
}

/** Test-only: set the tracked browser zone without going through Intl. */
export function setBrowserTimeZoneForTests(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    return;
  }
  browserTimeZoneStore.set(timeZone);
  if (pinnedTimeZoneStore.get() === null) {
    syncEffectiveTimeZone();
  }
}

export function resetEffectiveTimeZoneStoreForTests(): void {
  persistentBrowserStore.remove(STORAGE_KEYS.DEFAULT_TIMEZONE);
  pinnedTimeZoneStore.set(null);
  browserTimeZoneStore.set(getBrowserTimeZone());
  syncEffectiveTimeZone();
  resetTimezoneMismatchSnoozeForTests();
}
