import { useSyncExternalStore } from "react";
import { type CalendarId } from "@core/types/domain-primitives";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { createStorageBackedStore } from "@web/common/utils/external-store.util";
import {
  readHiddenCalendarIds,
  writeHiddenCalendarIds,
} from "./calendar-visibility.storage";

/**
 * Reactive mirror of the client-owned hidden-calendar-id set (S39 A2
 * follow-up). Storage (calendar-visibility.storage.ts) stays the source of
 * truth; this store just makes a change to it observable, so the calendars
 * query's `select` (calendar.query.ts) can derive isVisible on every read
 * instead of relying on whichever writer last hand-patched the query cache.
 * Any future writer of the calendars cache (SSE upsert, rename/color
 * mutation, test seeding) gets the overlay for free - there's nothing left
 * to remember to re-run.
 */
const hiddenIdsStore = createStorageBackedStore<ReadonlySet<string>>(
  STORAGE_KEYS.HIDDEN_CALENDAR_IDS,
  readHiddenCalendarIds,
);

/**
 * Persist + broadcast a visibility change. Returns false (and leaves the
 * store untouched) when the storage write fails, so callers can surface a
 * failure toast without the UI silently flipping first. Builds the next set
 * from the in-memory store (already the source of truth for this tab) and
 * writes it directly, rather than writing then re-reading storage to learn
 * what was just written.
 */
export function setCalendarVisibility(
  calendarId: CalendarId,
  isVisible: boolean,
): boolean {
  const next = new Set(hiddenIdsStore.get());
  if (isVisible) next.delete(calendarId);
  else next.add(calendarId);

  const saved = writeHiddenCalendarIds(next);
  if (saved) hiddenIdsStore.set(next);
  return saved;
}

export function useHiddenCalendarIds(): ReadonlySet<string> {
  return useSyncExternalStore(hiddenIdsStore.subscribe, hiddenIdsStore.get);
}

/**
 * Test-only: resyncs the in-memory store from storage. Registered in
 * reset-stores.ts for between-test cleanup; also called directly by tests
 * that seed a hidden id via calendar-visibility.storage.ts's setCalendarHidden
 * (bypassing this store's own write path) and need the store to observe it
 * before render.
 */
export function resetCalendarVisibilityStoreForTests(): void {
  hiddenIdsStore.refresh();
}
