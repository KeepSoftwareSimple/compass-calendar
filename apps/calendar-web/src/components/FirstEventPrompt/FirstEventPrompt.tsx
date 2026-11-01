import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { type FC, useCallback, useContext, useEffect } from "react";
import { PH_NO_RAGECLICK_CLASS } from "@web/auth/posthog/posthog-calendar-grid.util";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { useIsEditableFocused } from "@web/common/hooks/useIsEditableFocused";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import { NoticeCard } from "@web/components/BottomNoticeStack/NoticeCard";
import { NoticePrimaryButton } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
import {
  FIRST_EVENT_CREATE_HOTKEY,
  FIRST_EVENT_CREATE_KEYCAPS,
} from "@web/components/FirstEventPrompt/first-event.constants";
import {
  firstEventPromptActions,
  selectFirstEventCelebrating,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import { useFirstEventPromptSurfaceEligible } from "@web/components/FirstEventPrompt/useFirstEventPromptSurfaceEligible";
import { useQuickCreateFirstEvent } from "@web/components/FirstEventPrompt/useQuickCreateFirstEvent";
import IconButton from "@web/components/IconButton/IconButton";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/** How long the celebration copy holds before it fades out for good. */
const CELEBRATE_HOLD_MS = 4_000;

export const FIRST_EVENT_PROMPT_ARIA_LABEL = "Create your first event";

export const FIRST_EVENT_PROMPT_MESSAGE =
  "Your calendar is ready. Add something to it.";

export const FIRST_EVENT_PROMPT_PRIMARY_LABEL = "Add event";

const PromptCard: FC = () => {
  const isCelebrating = useFirstEventPromptStore(selectFirstEventCelebrating);
  const { closing, beginDismiss } = useDismissTransition(BANNER_DISMISS_MS);
  const quickCreateFirstEvent = useQuickCreateFirstEvent();
  const editableFocused = useIsEditableFocused();
  const showShortcutKeycaps = !editableFocused;

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

  const shortcutsEnabled = !isCelebrating && !closing;

  useAppShortcut(FIRST_EVENT_CREATE_HOTKEY, addFirstEvent, {
    enabled: shortcutsEnabled,
    ignoreInputs: true,
    preventDefault: true,
  });

  useAppShortcut("Escape", dismiss, {
    enabled: shortcutsEnabled,
    ignoreAppLock: true,
    preventDefault: true,
  });

  return (
    <NoticeCard
      ariaLabel={FIRST_EVENT_PROMPT_ARIA_LABEL}
      aria-keyshortcuts={
        showShortcutKeycaps ? FIRST_EVENT_CREATE_HOTKEY : undefined
      }
      className={PH_NO_RAGECLICK_CLASS}
      closing={closing}
      data-first-event-prompt=""
      opaque
    >
      {isCelebrating ? (
        <div className="flex flex-col gap-1 py-2">
          <span className="font-semibold text-sm">It's on the calendar.</span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-relaxed">
              {FIRST_EVENT_PROMPT_MESSAGE}
            </p>
            <IconButton
              aria-label="Dismiss"
              className="shrink-0 text-text-muted hover:text-text"
              onClick={dismiss}
              size="small"
            >
              <XIcon aria-hidden="true" size={14} />
            </IconButton>
          </div>
          <NoticePrimaryButton
            onClick={addFirstEvent}
            shortcutKeys={
              showShortcutKeycaps ? [...FIRST_EVENT_CREATE_KEYCAPS] : undefined
            }
          >
            {FIRST_EVENT_PROMPT_PRIMARY_LABEL}
          </NoticePrimaryButton>
        </>
      )}
    </NoticeCard>
  );
};

export const FirstEventPrompt: FC = () => {
  const { isOpen: isAuthModalOpen } = useContext(AuthModalContext);
  const isLive = useFirstEventPromptSurfaceEligible(isAuthModalOpen);
  if (!isLive) return null;
  return <PromptCard />;
};
