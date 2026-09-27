import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { hasPlayDeepLink } from "@web/components/ShortcutShowcase/play-link";

export function hasSeenWelcome(): boolean {
  if (!persistentBrowserStore.isAvailable()) return true;
  return persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_WELCOME) === "true";
}

export function markWelcomeSeen(): void {
  persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_WELCOME, "true");
}

/** Whether the welcome modal should claim the onboarding surface slot. */
export function selectWelcomeModalSurfaceEligible(
  showCalendarOnboarding: boolean,
  authenticated: boolean,
  isFirstVisitOpen: boolean,
): boolean {
  if (!showCalendarOnboarding) return false;
  if (authenticated) return false;
  if (hasPlayDeepLink()) return false;
  if (!hasSeenWelcome()) return true;
  // Explore marks welcome seen before the fade finishes; keep the slot until
  // WelcomeModal clears first-visit open.
  return isFirstVisitOpen;
}
