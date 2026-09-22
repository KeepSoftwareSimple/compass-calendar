import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createStorageBackedStore } from "@web/common/utils/external-store.util";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { timeZoneCityName } from "@web/timezone/timezone-catalog";

export function shouldShowTimezoneMismatch(
  pinnedTimeZone: string | null,
  browserTimeZone: string,
  snoozedForBrowser: string | null,
): boolean {
  return (
    pinnedTimeZone !== null &&
    pinnedTimeZone !== browserTimeZone &&
    snoozedForBrowser !== browserTimeZone
  );
}

function readSnoozedBrowser(): string | null {
  return persistentBrowserStore.get(
    STORAGE_KEYS.TIMEZONE_MISMATCH_SNOOZED_BROWSER,
  );
}

const snoozedBrowserStore = createStorageBackedStore<string | null>(
  STORAGE_KEYS.TIMEZONE_MISMATCH_SNOOZED_BROWSER,
  readSnoozedBrowser,
);

export function getTimezoneMismatchSnoozedBrowser(): string | null {
  return snoozedBrowserStore.get();
}

export function snoozeTimezoneMismatch(browserTimeZone: string): boolean {
  const saved = persistentBrowserStore.set(
    STORAGE_KEYS.TIMEZONE_MISMATCH_SNOOZED_BROWSER,
    browserTimeZone,
  );
  if (saved) {
    snoozedBrowserStore.set(browserTimeZone);
  }
  return saved;
}

export function useTimezoneMismatchSnoozedBrowser(): string | null {
  return useSyncExternalStore(
    snoozedBrowserStore.subscribe,
    getTimezoneMismatchSnoozedBrowser,
  );
}

export function resetTimezoneMismatchSnoozeForTests(): void {
  persistentBrowserStore.remove(STORAGE_KEYS.TIMEZONE_MISMATCH_SNOOZED_BROWSER);
  snoozedBrowserStore.set(null);
}

export function timezoneMismatchCopy(
  browserZone: string,
  calendarZone: string,
  at: Date = new Date(),
): { keepLabel: string; message: string; switchLabel: string } {
  const browserCity = timeZoneCityName(browserZone);
  const calendarCity = timeZoneCityName(calendarZone);
  const browserAbbr = formatTimeZoneAbbreviation(browserZone, at);
  const calendarAbbr = formatTimeZoneAbbreviation(calendarZone, at);

  return {
    keepLabel: `Keep ${calendarAbbr}`,
    message: `Your device is in ${browserCity} time (${browserAbbr}) but your calendar is showing ${calendarCity} time (${calendarAbbr}).`,
    switchLabel: `Switch to ${browserAbbr}`,
  };
}
