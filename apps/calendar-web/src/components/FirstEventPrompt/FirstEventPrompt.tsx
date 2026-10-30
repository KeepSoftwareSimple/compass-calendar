import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import classNames from "classnames";
import { type FC, useCallback, useContext, useEffect, useRef } from "react";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { PH_NO_RAGECLICK_CLASS } from "@web/auth/posthog/posthog-calendar-grid.util";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { useIsEditableFocused } from "@web/common/hooks/useIsEditableFocused";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import { FIRST_EVENT_CREATE_KEYCAPS } from "@web/components/FirstEventPrompt/first-event.constants";
import {
  firstEventPromptActions,
  selectFirstEventCelebrating,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import { useFirstEventPromptStackRegistration } from "@web/components/FirstEventPrompt/useFirstEventPromptStackRegistration";
import { useFirstEventPromptSurfaceEligible } from "@web/components/FirstEventPrompt/useFirstEventPromptSurfaceEligible";
import { useQuickCreateFirstEvent } from "@web/components/FirstEventPrompt/useQuickCreateFirstEvent";
import IconButton from "@web/components/IconButton/IconButton";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { useIsNarrowSidebarLayout } from "@web/components/Sidebar/hooks/useIsNarrowSidebarLayout";
import {
  selectIsSidebarOpen,
  useViewStore,
} from "@web/events/stores/view.store";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/** How long the celebration copy holds before it fades out for good. */
const CELEBRATE_HOLD_MS = 4_000;

export const FIRST_EVENT_PROMPT_ARIA_LABEL = "Create your first event";

export const FIRST_EVENT_PROMPT_MESSAGE = "Add your first event.";

export const FIRST_EVENT_PROMPT_PRIMARY_LABEL = "Add Coffee";

const PromptCard: FC = () => {
  const anchorRef = useRef<HTMLElement>(null);
  const isCelebrating = useFirstEventPromptStore(selectFirstEventCelebrating);
  const { closing, beginDismiss } = useDismissTransition(BANNER_DISMISS_MS);
  const quickCreateFirstEvent = useQuickCreateFirstEvent();
  const editableFocused = useIsEditableFocused();
  const showShortcutKeycaps = !editableFocused;
  const isNarrowLayout = useIsNarrowSidebarLayout();
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  const clearsSidebarFooter = !isNarrowLayout && isSidebarOpen;

  useFirstEventPromptStackRegistration(anchorRef, !closing && !isCelebrating);

  useEffect(() => {
    firstEventPromptActions.trackShownOnce();
  }, []);

  // Hold the celebration briefly, then fade out and disappear forever.
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

  return (
    <aside
      ref={anchorRef}
      aria-label={FIRST_EVENT_PROMPT_ARIA_LABEL}
      aria-keyshortcuts={
        showShortcutKeycaps ? APP_SHORTCUT_BINDINGS.editSave.hotkey : undefined
      }
      className={classNames(
        "fixed starting:translate-y-2 starting:opacity-0 transition-all duration-300 data-closing:opacity-0 motion-reduce:transition-none",
        PH_NO_RAGECLICK_CLASS,
        isNarrowLayout ? "inset-x-4 bottom-4 max-w-none" : "right-6 w-80",
        clearsSidebarFooter
          ? "bottom-20"
          : isNarrowLayout
            ? "bottom-4"
            : "bottom-6",
      )}
      data-clears-sidebar-footer={clearsSidebarFooter || undefined}
      data-closing={closing || undefined}
      data-first-event-prompt=""
      data-notice=""
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <div className="flex w-80 flex-col gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 text-text shadow-xl backdrop-blur-2xl backdrop-saturate-150">
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
            <button
              className="c-button-compact c-button-primary inline-flex items-center justify-center gap-2 self-start rounded-xs px-3 py-1.5 text-s"
              onClick={addFirstEvent}
              type="button"
            >
              {FIRST_EVENT_PROMPT_PRIMARY_LABEL}
              {showShortcutKeycaps ? (
                <ShortcutKeys keys={[...FIRST_EVENT_CREATE_KEYCAPS]} />
              ) : null}
            </button>
          </>
        )}
      </div>
    </aside>
  );
};

/**
 * Non-blocking prompt in the real calendar once the practice takeover is not
 * active. Completes on the first genuine event create (see
 * noteFirstRealEventCreated in useEventMutations.ts), celebrates, and retires
 * the card forever. Dismissing retires it silently.
 */
export const FirstEventPrompt: FC = () => {
  const { isOpen: isAuthModalOpen } = useContext(AuthModalContext);
  // Without storage (private mode), completion and dismissal can never
  // persist, so the card would haunt every reload; better to not show it.
  // Sit above the auth modal in z-index, so stay hidden while login/signup
  // is open even if the showcase flag is already set. Settings, About, and
  // the event form paint below this tooltip layer, so hide rather than
  // compete. Opening the form is not completion: cancel brings the card
  // back, and a real create still celebrates after the form closes.
  const isLive = useFirstEventPromptSurfaceEligible(isAuthModalOpen);
  if (!isLive) return null;
  return <PromptCard />;
};
