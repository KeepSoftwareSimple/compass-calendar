import { type FC, useCallback, useContext, useEffect } from "react";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { PH_NO_RAGECLICK_CLASS } from "@web/auth/posthog/posthog-calendar-grid.util";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { useIsEditableFocused } from "@web/common/hooks/useIsEditableFocused";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import {
  BOTTOM_NOTICE_MESSAGE_CLASS,
  BottomNotice,
} from "@web/components/BottomNoticeStack/BottomNotice";
import { BOTTOM_NOTICE_QUEUE_ID } from "@web/components/BottomNoticeStack/bottom-notice.constants";
import { useBottomNoticeQueue } from "@web/components/BottomNoticeStack/useBottomNoticeQueue";
import { FIRST_EVENT_CREATE_KEYCAPS } from "@web/components/FirstEventPrompt/first-event.constants";
import {
  firstEventPromptActions,
  selectFirstEventCelebrating,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import { useFirstEventPromptSurfaceEligible } from "@web/components/FirstEventPrompt/useFirstEventPromptSurfaceEligible";
import { useQuickCreateFirstEvent } from "@web/components/FirstEventPrompt/useQuickCreateFirstEvent";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/** How long the celebration copy holds before it fades out for good. */
const CELEBRATE_HOLD_MS = 4_000;

export const FIRST_EVENT_PROMPT_ARIA_LABEL = "Create your first event";

export const FIRST_EVENT_PROMPT_MESSAGE = "Add your first event.";

export const FIRST_EVENT_PROMPT_PRIMARY_LABEL = "Add Coffee";

const PromptCard: FC = () => {
  const isCelebrating = useFirstEventPromptStore(selectFirstEventCelebrating);
  const { closing, beginDismiss } = useDismissTransition(BANNER_DISMISS_MS);
  const quickCreateFirstEvent = useQuickCreateFirstEvent();
  const editableFocused = useIsEditableFocused();
  const showShortcutKeycaps = !editableFocused;
  const visibleInQueue = useBottomNoticeQueue(
    BOTTOM_NOTICE_QUEUE_ID.firstEvent,
    true,
  );

  useEffect(() => {
    firstEventPromptActions.trackShownOnce();
  }, []);

  useEffect(() => {
    if (!isCelebrating) return;
    const timer = window.setTimeout(() => {
      beginDismiss(firstEventPromptActions.finalizeCompleted);
    }, CELEBRATE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [isCelebrating, beginDismiss]);

  const dismiss = useCallback(() => {
    beginDismiss(firstEventPromptActions.dismiss);
  }, [beginDismiss]);

  const addFirstEvent = useCallback(() => {
    quickCreateFirstEvent();
  }, [quickCreateFirstEvent]);

  const shortcutsEnabled = visibleInQueue && !isCelebrating && !closing;

  useAppShortcut(APP_SHORTCUT_BINDINGS.editSave.hotkey, addFirstEvent, {
    enabled: shortcutsEnabled,
    ignoreInputs: true,
    preventDefault: true,
  });

  useAppShortcut("Escape", dismiss, {
    enabled: shortcutsEnabled,
    ignoreAppLock: true,
    preventDefault: true,
  });

  if (!visibleInQueue) return null;

  if (isCelebrating) {
    return (
      <BottomNotice
        ariaLabel={FIRST_EVENT_PROMPT_ARIA_LABEL}
        className={PH_NO_RAGECLICK_CLASS}
        closing={closing}
        data-first-event-prompt=""
        showDismiss={false}
        showPrimary={false}
      >
        <p className={BOTTOM_NOTICE_MESSAGE_CLASS}>It's on the calendar.</p>
      </BottomNotice>
    );
  }

  return (
    <BottomNotice
      ariaLabel={FIRST_EVENT_PROMPT_ARIA_LABEL}
      aria-keyshortcuts={
        showShortcutKeycaps ? APP_SHORTCUT_BINDINGS.editSave.hotkey : undefined
      }
      className={PH_NO_RAGECLICK_CLASS}
      closing={closing}
      data-first-event-prompt=""
      message={FIRST_EVENT_PROMPT_MESSAGE}
      onDismiss={dismiss}
      onPrimary={addFirstEvent}
      primaryLabel={FIRST_EVENT_PROMPT_PRIMARY_LABEL}
      primaryShortcutKeys={
        showShortcutKeycaps ? [...FIRST_EVENT_CREATE_KEYCAPS] : undefined
      }
    />
  );
};

export const FirstEventPrompt: FC = () => {
  const { isOpen: isAuthModalOpen } = useContext(AuthModalContext);
  const isLive = useFirstEventPromptSurfaceEligible(isAuthModalOpen);
  if (!isLive) return null;
  return <PromptCard />;
};
