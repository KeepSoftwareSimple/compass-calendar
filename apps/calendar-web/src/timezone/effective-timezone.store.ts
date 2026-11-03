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
import {
  getTimezoneMismatchSnoozedBrowser,
  resetTimezoneMismatchSnoozeForTests,
} from "@web/timezone/timezone-mismatch";
import { isUtcLikeTimeZone } from "@web/timezone/utc-like-timezone";

const calendarTimeZoneHintStore = createExternalStore<string | null>(null);

function readPinnedTimeZone(): string | null {
  const raw = persistentBrowserStore.get(STORAGE_KEYS.DEFAULT_TIMEZONE);
  if (!raw || raw.trim().length === 0 || !isValidTimeZone(raw)) {
    return null;
  }
  return raw;
}

/** Exported for unit tests; parity harness UTC pins are cleared unless the user kept UTC. */
export function shouldClearAccidentalUtcPin(pinned: string): boolean {
  if (!isUtcLikeTimeZone(pinned)) {
    return false;
  }
  const snoozed = getTimezoneMismatchSnoozedBrowser();
  if (snoozed !== null && !isUtcLikeTimeZone(snoozed)) {
    return false;
  }
  const browser = getBrowserTimeZone();
  if (isUtcLikeTimeZone(browser)) {
    return true;
  }
  return snoozed !== browser;
}

function repairAccidentalUtcPinInStorage(): void {
  const pinned = readPinnedTimeZone();
  if (pinned === null || !shouldClearAccidentalUtcPin(pinned)) {
    return;
  }
  persistentBrowserStore.remove(STORAGE_KEYS.DEFAULT_TIMEZONE);
}

repairAccidentalUtcPinInStorage();

const pinnedTimeZoneStore = createExternalStore<string | null>(
  readPinnedTimeZone(),
);
const browserTimeZoneStore = createExternalStore(getBrowserTimeZone());

export function setCalendarTimeZoneHint(timeZone: string | null): void {
  if (timeZone !== null && !isValidTimeZone(timeZone)) {
    return;
  }
  if (calendarTimeZoneHintStore.get() === timeZone) {
    return;
  }
  calendarTimeZoneHintStore.set(timeZone);
  syncEffectiveTimeZone();
}

/** A pin wins, then the calendar's own zone hint, then the device zone. */
function currentEffectiveTimeZone(): string {
  const pinned = pinnedTimeZoneStore.get();
  if (pinned !== null) {
    return pinned;
  }
  return calendarTimeZoneHintStore.get() || browserTimeZoneStore.get();
}

function syncEffectiveTimeZone(): void {
  dayjs.setDefaultTimezone(currentEffectiveTimeZone());
}

syncEffectiveTimeZone();

function refreshPinnedFromStorage(): void {
  repairAccidentalUtcPinInStorage();
  pinnedTimeZoneStore.set(readPinnedTimeZone());
  syncEffectiveTimeZone();
}

/**
 * Re-read device timezone preferences after the bundle loads. Refreshes Intl
 * in Auto mode and drops parity-style UTC pins that were never confirmed.
 */
export function hydrateEffectiveTimeZonePreference(): void {
  refreshPinnedFromStorage();
  refreshEffectiveTimeZoneFromBrowser();
}

export function getPinnedTimeZone(): string | null {
  return pinnedTimeZoneStore.get();
}

export function getEffectiveTimeZone(): string {
  return currentEffectiveTimeZone();
}

function applyTrackedBrowserTimeZone(timeZone: string): void {
  browserTimeZoneStore.set(timeZone);
  if (pinnedTimeZoneStore.get() === null) {
    syncEffectiveTimeZone();
  }
}

/**
 * Refresh the tracked browser zone. The effective zone only follows this
 * value in Auto mode (no pin).
 */
export function refreshEffectiveTimeZoneFromBrowser(): void {
  applyTrackedBrowserTimeZone(getBrowserTimeZone());
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
  const unsubscribeHint = calendarTimeZoneHintStore.subscribe(onChange);
  const unsubscribeStorage = subscribeToStorageKey(
    STORAGE_KEYS.DEFAULT_TIMEZONE,
    refreshPinnedFromStorage,
  );

  return () => {
    unsubscribePinned();
    unsubscribeBrowser();
    unsubscribeHint();
    unsubscribeStorage();
  };
}

export function useEffectiveTimeZone(): string {
  return useSyncExternalStore(subscribe, getEffectiveTimeZone);
}

export function usePinnedTimeZone(): string | null {
  return useSyncExternalStore(subscribe, getPinnedTimeZone);
}

export function getTrackedBrowserTimeZone(): string {
  return browserTimeZoneStore.get();
}

export function useBrowserTimeZone(): string {
  return useSyncExternalStore(subscribe, getTrackedBrowserTimeZone);
}

/** Test-only: set the tracked browser zone without going through Intl. */
export function setBrowserTimeZoneForTests(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    return;
  }
  applyTrackedBrowserTimeZone(timeZone);
}

export function resetEffectiveTimeZoneStoreForTests(): void {
  persistentBrowserStore.remove(STORAGE_KEYS.DEFAULT_TIMEZONE);
  pinnedTimeZoneStore.set(null);
  calendarTimeZoneHintStore.set(null);
  browserTimeZoneStore.set(getBrowserTimeZone());
  syncEffectiveTimeZone();
  resetTimezoneMismatchSnoozeForTests();
}
