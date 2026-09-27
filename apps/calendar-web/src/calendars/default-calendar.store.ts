import { useSyncExternalStore } from "react";
import { type CalendarId } from "@core/types/domain-primitives";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createStorageBackedStore } from "@web/common/utils/external-store.util";

/**
 * The calendar new events are created on, chosen by the user from the
 * Default Calendar picker in Settings. Client-owned, mirroring the
 * hidden-calendar-ids store: one localStorage key is the source of truth,
 * and this makes changes to it observable.
 *
 * Wart, named: the preference lives on this device only, so it does not roam
 * across browsers. A server-side preference can supersede it later without a
 * migration - an unknown or stale id already falls back to the derived
 * default (see getDefaultTargetCalendar).
 */

function readDefaultCalendarId(): string | null {
  const raw = persistentBrowserStore.get(STORAGE_KEYS.DEFAULT_CALENDAR_ID);
  return raw && raw.trim().length > 0 ? raw : null;
}

const defaultCalendarIdStore = createStorageBackedStore<string | null>(
  STORAGE_KEYS.DEFAULT_CALENDAR_ID,
  readDefaultCalendarId,
);

/**
 * Persist + broadcast the chosen default calendar; pass null to clear it and
 * fall back to the derived default. Returns false (leaving the store
 * untouched) when the storage write fails, so callers can surface a failure
 * rather than showing a preference that did not stick.
 */
export function setDefaultCalendarId(calendarId: CalendarId | null): boolean {
  const saved =
    calendarId === null
      ? persistentBrowserStore.remove(STORAGE_KEYS.DEFAULT_CALENDAR_ID)
      : persistentBrowserStore.set(
          STORAGE_KEYS.DEFAULT_CALENDAR_ID,
          calendarId,
        );

  if (saved) defaultCalendarIdStore.set(calendarId);
  return saved;
}

export function useDefaultCalendarId(): string | null {
  return useSyncExternalStore(
    defaultCalendarIdStore.subscribe,
    defaultCalendarIdStore.get,
  );
}

/** Test-only: resyncs the in-memory store from storage. */
export function resetDefaultCalendarStoreForTests(): void {
  defaultCalendarIdStore.refresh();
}
