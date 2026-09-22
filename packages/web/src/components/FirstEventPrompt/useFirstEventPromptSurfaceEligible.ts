import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  selectFirstEventDone,
  selectFirstEventPromptSurfaceEligible,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  selectHasSeenShowcase,
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
 * Shared eligibility read for RootShell (slot) and FirstEventPrompt (unmount
 * while Settings/auth/form chrome is open). `isAuthModalOpen` is passed in
 * because RootShell lives outside AuthModalProvider.
 */
export function useFirstEventPromptSurfaceEligible(
  isAuthModalOpen: boolean,
): boolean {
  const isShowcaseActive = useShortcutShowcaseStore(selectShowcaseActive);
  const hasSeenShowcaseThisSession = useShortcutShowcaseStore(
    selectHasSeenShowcase,
  );
  const isDone = useFirstEventPromptStore(selectFirstEventDone);
  const isSettingsOpen = useSettingsStore(selectIsSettingsOpen);
  const isAboutOpen = useSettingsStore(selectIsAboutOpen);
  const isFormOpen = useDraftStore(selectIsEventFormOpen);

  return selectFirstEventPromptSurfaceEligible({
    isAuthModalOpen,
    isSettingsOpen,
    isAboutOpen,
    isFormOpen,
    isDone,
    storageAvailable: persistentBrowserStore.isAvailable(),
    showcaseActive: isShowcaseActive,
    hasSeenShowcaseThisSession,
  });
}
