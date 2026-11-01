import { shouldDeferFirstEventPromptForSignUpNudge } from "@web/auth/posthog/anon-explorer-engagement.util";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  type FirstEventPromptEligibility,
  selectFirstEventDone,
  selectFirstEventPromptSurfaceEligible,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  selectShowcaseActive,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  selectIsAboutOpen,
  selectIsSettingsOpen,
  useSettingsStore,
} from "@web/settings/settings.store";

/**
 * Store-backed eligibility input for the first-event card. Local-mode connect
 * uses the same read so the two surfaces cannot drift. `isAuthModalOpen` is
 * passed in because RootShell lives outside AuthModalProvider.
 */
export function useFirstEventPromptEligibilityInput(
  isAuthModalOpen: boolean,
): FirstEventPromptEligibility {
  const isShowcaseActive = useShortcutShowcaseStore(selectShowcaseActive);
  const isDone = useFirstEventPromptStore(selectFirstEventDone);
  const isSettingsOpen = useSettingsStore(selectIsSettingsOpen);
  const isAboutOpen = useSettingsStore(selectIsAboutOpen);
  const isFormOpen = useDraftStore(selectIsEventFormOpen);

  return {
    isAuthModalOpen,
    isSettingsOpen,
    isAboutOpen,
    isFormOpen,
    isDone,
    storageAvailable: persistentBrowserStore.isAvailable(),
    showcaseActive: isShowcaseActive,
  };
}

/**
 * Shared eligibility read for RootShell (slot) and FirstEventPrompt (unmount
 * while Settings/auth/form chrome is open).
 */
export function useFirstEventPromptSurfaceEligible(
  isAuthModalOpen: boolean,
): boolean {
  return (
    selectFirstEventPromptSurfaceEligible(
      useFirstEventPromptEligibilityInput(isAuthModalOpen),
    ) && !shouldDeferFirstEventPromptForSignUpNudge()
  );
}
