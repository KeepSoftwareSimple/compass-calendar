import { create } from "zustand";
import { track } from "@web/auth/posthog/track";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  getFirstEventDone,
  markFirstEventDone,
} from "@web/components/FirstEventPrompt/first-event.storage";
import {
  selectShowcaseActive,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";

export type FirstEventPromptState = {
  isDone: boolean;
  /** The real event just landed; the card celebrates before finalizing. */
  isCelebrating: boolean;
};

export const initialFirstEventPromptState: FirstEventPromptState = {
  isDone: false,
  isCelebrating: false,
};

/** Analytics-only once-per-session guard; nothing renders from it. */
let hasTrackedShown = false;

export const useFirstEventPromptStore = create<FirstEventPromptState>()(() => ({
  ...initialFirstEventPromptState,
  isDone: getFirstEventDone() !== null,
}));

/** True when the first-event card may show: the practice takeover is not active. */
export const isShowcaseHandoffEligible = (showcaseActive: boolean): boolean =>
  !showcaseActive;

const isEligibleNow = (): boolean =>
  isShowcaseHandoffEligible(
    selectShowcaseActive(useShortcutShowcaseStore.getState()),
  );

export const firstEventPromptActions = {
  /**
   * Called from the create-event mutation funnel on every genuine create
   * (undo/redo replays and demo seeds never reach it). Only the first one
   * that lands while the prompt is relevant completes it.
   */
  noteRealEventCreated: () => {
    const { isDone, isCelebrating } = useFirstEventPromptStore.getState();
    if (isDone || isCelebrating) return;
    if (!persistentBrowserStore.isAvailable()) return;
    if (!isEligibleNow()) return;
    markFirstEventDone("completed");
    track("first_event_prompt_completed");
    useFirstEventPromptStore.setState({ isCelebrating: true });
  },
  /** Celebration finished: the card disappears forever. */
  finalizeCompleted: () => {
    useFirstEventPromptStore.setState({ isDone: true, isCelebrating: false });
  },
  dismiss: () => {
    // The dismiss button only exists on the not-yet-celebrating view, but
    // its click is deferred behind a fade-out (FirstEventPrompt.tsx); a real
    // create can land and start celebrating during that fade. Once
    // celebrating (or already done), a genuine completion wins - don't let
    // a stale dismiss overwrite it.
    if (useFirstEventPromptStore.getState().isCelebrating) return;
    track("first_event_prompt_dismissed");
    markFirstEventDone("dismissed");
    useFirstEventPromptStore.setState({ isDone: true, isCelebrating: false });
  },
  /** First visible render this session. */
  trackShownOnce: () => {
    if (hasTrackedShown) return;
    hasTrackedShown = true;
    track("first_event_prompt_shown");
  },
};

/**
 * Standalone export for the create-event mutation funnel, so that hook
 * doesn't need to import the whole actions object for one call.
 */
export const noteFirstRealEventCreated =
  firstEventPromptActions.noteRealEventCreated;

export const selectFirstEventDone = (state: FirstEventPromptState) =>
  state.isDone;

export const selectFirstEventCelebrating = (state: FirstEventPromptState) =>
  state.isCelebrating;

export type FirstEventPromptEligibility = {
  isAuthModalOpen: boolean;
  isSettingsOpen: boolean;
  isAboutOpen: boolean;
  isFormOpen: boolean;
  isDone: boolean;
  storageAvailable: boolean;
  showcaseActive: boolean;
};

/** Whether the first-event card should claim the onboarding surface slot. */
export const selectFirstEventPromptSurfaceEligible = (
  input: FirstEventPromptEligibility,
): boolean =>
  !input.isAuthModalOpen &&
  !input.isSettingsOpen &&
  !input.isAboutOpen &&
  !input.isFormOpen &&
  !input.isDone &&
  input.storageAvailable &&
  isShowcaseHandoffEligible(input.showcaseActive);
