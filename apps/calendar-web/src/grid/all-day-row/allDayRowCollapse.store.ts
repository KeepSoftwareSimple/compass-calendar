import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { createBooleanPreferenceStore } from "@web/common/storage/boolean-preference.store";
import { createExternalStore } from "@web/common/utils/external-store.util";

/** Persisted: the user expanded a busy all-day row (absent = collapsed). */
const expandedStore = createBooleanPreferenceStore(
  STORAGE_KEYS.ALL_DAY_ROW_EXPANDED,
);

/**
 * Runtime only: the mounted all-day row has more lanes than the collapse
 * threshold. The toggle shortcut is a no-op otherwise, so a stray Shift+A on
 * a quiet week cannot flip a preference the user cannot see.
 */
const collapsibleStore = createExternalStore(false);

export function useAllDayRowExpanded(): boolean {
  return useSyncExternalStore(
    expandedStore.subscribe,
    expandedStore.get,
    () => false,
  );
}

export function readAllDayRowExpanded(): boolean {
  return expandedStore.get();
}

export function setAllDayRowExpanded(expanded: boolean): void {
  expandedStore.set(expanded);
}

export function setAllDayRowCollapsible(collapsible: boolean): void {
  collapsibleStore.set(collapsible);
}

export function isAllDayRowCollapsibleNow(): boolean {
  return collapsibleStore.get();
}

/** Flips the persisted state; returns false when there is nothing to fold. */
export function toggleAllDayRowExpanded(): boolean {
  if (!collapsibleStore.get()) return false;
  expandedStore.set(!expandedStore.get());
  return true;
}

/** Test-only: resync from storage and forget the mounted row. */
export function resetAllDayRowCollapseStoreForTests(): void {
  expandedStore.refresh();
  collapsibleStore.set(false);
}
