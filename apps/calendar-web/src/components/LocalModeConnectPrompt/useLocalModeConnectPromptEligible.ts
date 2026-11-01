import { useContext } from "react";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { hasUserEverAuthenticated } from "@web/auth/compass/state/auth.state.util";
import { useIsProviderAvailable } from "@web/auth/providers/useIsProviderAvailable";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  selectFirstEventCelebrating,
  selectFirstEventPromptSurfaceEligible,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import { useFirstEventPromptEligibilityInput } from "@web/components/FirstEventPrompt/useFirstEventPromptSurfaceEligible";
import {
  selectLocalModeConnectPromptDismissed,
  selectLocalModeConnectPromptEligible,
  selectLocalModeConnectPromptShortcutEngagementCount,
  selectLocalModeConnectPromptWriteCount,
  useLocalModeConnectPromptStore,
} from "@web/components/LocalModeConnectPrompt/local-mode-connect.store";
import {
  selectShowcaseActive,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import {
  selectWelcomeFirstVisitOpen,
  useWelcomeGuideStore,
} from "@web/components/WelcomeModal/welcome.guide.store";
import { hasSeenWelcome } from "@web/components/WelcomeModal/welcome.modal.util";

export function useLocalModeConnectPromptEligible(isAuthModalOpen: boolean): {
  isLive: boolean;
  writeCount: number;
} {
  const { authenticated } = useContext(SessionContext);
  const writeCount = useLocalModeConnectPromptStore(
    selectLocalModeConnectPromptWriteCount,
  );
  const shortcutEngagementCount = useLocalModeConnectPromptStore(
    selectLocalModeConnectPromptShortcutEngagementCount,
  );
  const isDismissed = useLocalModeConnectPromptStore(
    selectLocalModeConnectPromptDismissed,
  );
  const isShowcaseActive = useShortcutShowcaseStore(selectShowcaseActive);
  const isWelcomeFirstVisitOpen = useWelcomeGuideStore(
    selectWelcomeFirstVisitOpen,
  );
  const googleSignInAvailable = useIsProviderAvailable("google", "signIn");
  const isFirstEventCelebrating = useFirstEventPromptStore(
    selectFirstEventCelebrating,
  );
  const firstEventPromptVisible = selectFirstEventPromptSurfaceEligible(
    useFirstEventPromptEligibilityInput(isAuthModalOpen),
  );

  return {
    isLive: selectLocalModeConnectPromptEligible({
      authenticated,
      hasUserEverAuthenticated: hasUserEverAuthenticated(),
      writeCount,
      shortcutEngagementCount,
      isDismissed,
      storageAvailable: persistentBrowserStore.isAvailable(),
      isAuthModalOpen,
      isShowcaseActive,
      isWelcomeBlocking: !hasSeenWelcome() || isWelcomeFirstVisitOpen,
      googleSignInAvailable,
      firstEventPromptVisible,
      firstEventCelebrating: isFirstEventCelebrating,
    }),
    writeCount,
  };
}
