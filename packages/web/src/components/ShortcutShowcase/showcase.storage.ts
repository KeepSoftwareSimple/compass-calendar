import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

const isStoredTrue = (key: string) =>
  persistentBrowserStore.get(key) === "true";

/**
 * Users who finished or skipped the retired guided tour wrote this key; treat
 * them as having seen the showcase so the takeover never ambushes an
 * established user. Deliberately outside the typed StorageKey union: the key
 * is dead except for this one read.
 */
const LEGACY_TOUR_SEEN_KEY = "compass.onboarding.has-seen-onboarding-tour";

export function hasSeenShortcutShowcase(): boolean {
  // Fail closed: never auto-launch a takeover when storage is unavailable.
  if (!persistentBrowserStore.isAvailable()) return true;
  return (
    isStoredTrue(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE) ||
    isStoredTrue(LEGACY_TOUR_SEEN_KEY)
  );
}

export function markShortcutShowcaseSeen(): void {
  persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "true");
}

/**
 * A single-sitting game has no mid-run resume point: any stored value under the
 * old step key (the sentinel below, or a lesson step id written before the
 * game shipped) just means "an unfinished attempt exists", and a reload
 * re-offers the game from its how-to card.
 */
export function hasShowcaseInProgress(): boolean {
  if (!persistentBrowserStore.isAvailable()) return false;
  return Boolean(
    persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP),
  );
}

export function markShowcaseInProgress(): void {
  persistentBrowserStore.set(
    STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP,
    "in-progress",
  );
}

export function clearShowcaseProgress(): void {
  persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP);
}
