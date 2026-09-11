import { type FC, useContext, useEffect } from "react";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import {
  firstEventPromptActions,
  isShowcaseHandoffEligible,
  selectFirstEventCelebrating,
  selectFirstEventDone,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  selectHasSeenShowcase,
  selectShowcaseActive,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  selectIsAboutOpen,
  selectIsSettingsOpen,
  useSettingsStore,
} from "@web/settings/settings.store";
import { KEYMAP } from "@web/shortcuts/keymap";

/** How long the celebration copy holds before it fades out for good. */
const CELEBRATE_HOLD_MS = 4_000;

const PromptCard: FC = () => {
  const isCelebrating = useFirstEventPromptStore(selectFirstEventCelebrating);
  const { closing, beginDismiss } = useDismissTransition(BANNER_DISMISS_MS);

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

  const dismiss = () => beginDismiss(firstEventPromptActions.dismiss);

  return (
    <aside
      aria-label="Create your first event"
      className="fixed right-6 bottom-6 starting:translate-y-2 starting:opacity-0 transition-all duration-300 data-closing:opacity-0 motion-reduce:transition-none"
      data-closing={closing || undefined}
      data-notice=""
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <div className="w-72 rounded-xl border border-border bg-surface/95 px-4 py-3 text-text shadow-xl backdrop-blur-2xl backdrop-saturate-150">
        {isCelebrating ? (
          <div className="flex flex-col gap-1 py-2">
            <span className="font-semibold text-sm">It's on the calendar.</span>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="font-semibold text-sm">
                Add your first event
              </span>
              <button
                aria-label="Dismiss"
                className="c-focus-ring shrink-0 rounded-xs px-1 text-text-muted text-xs hover:text-text"
                onClick={dismiss}
                type="button"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-text-muted text-xs">Press</span>
              <ShortcutKeys keys={[...KEYMAP.createEvent.keycaps]} />
              <span className="text-text-muted text-xs">
                , type a title, then Enter.
              </span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

/**
 * Non-blocking prompt shown in the real app once the showcase is done
 * (finished or skipped): the contextual handoff from practice to the real
 * product. Completes on the first genuine event create (see
 * noteFirstRealEventCreated in useEventMutations.ts), celebrates, and retires
 * the card forever. Dismissing retires it silently.
 */
export const FirstEventPrompt: FC = () => {
  const { isOpen: isAuthModalOpen } = useContext(AuthModalContext);
  const isShowcaseActive = useShortcutShowcaseStore(selectShowcaseActive);
  // The store flag covers a markSeen this session (storage notifies nobody);
  // the storage read covers earlier sessions and the legacy tour key.
  const seenThisSession = useShortcutShowcaseStore(selectHasSeenShowcase);
  const isDone = useFirstEventPromptStore(selectFirstEventDone);
  const isSettingsOpen = useSettingsStore(selectIsSettingsOpen);
  const isAboutOpen = useSettingsStore(selectIsAboutOpen);
  const isFormOpen = useDraftStore(selectIsEventFormOpen);
  // Without storage (private mode), completion and dismissal can never
  // persist, so the card would haunt every reload; better to not show it.
  // Sit above the auth modal in z-index, so stay hidden while login/signup
  // is open even if the showcase flag is already set. Settings, About, and
  // the event form paint below this tooltip layer, so hide rather than
  // compete. Opening the form is not completion: cancel brings the card
  // back, and a real create still celebrates after the form closes.
  const isLive =
    !isAuthModalOpen &&
    !isSettingsOpen &&
    !isAboutOpen &&
    !isFormOpen &&
    !isDone &&
    persistentBrowserStore.isAvailable() &&
    isShowcaseHandoffEligible(isShowcaseActive, seenThisSession);
  if (!isLive) return null;
  return <PromptCard />;
};
