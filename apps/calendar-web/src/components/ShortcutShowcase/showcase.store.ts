import { create } from "zustand";
import { track } from "@web/auth/posthog/track";
import {
  clearShowcaseProgress,
  hasSeenShortcutShowcase,
  hasShowcaseInProgress,
  markShortcutShowcaseSeen,
  markShowcaseInProgress,
} from "@web/components/ShortcutShowcase/showcase.storage";

/** How the practice arena was opened, so the activation funnel can tell them apart. */
export type ShowcaseEntry = "welcome" | "post_signup" | "palette" | "link";

/** Where a user who left early went next, so the funnel can tell them apart. */
export type ShowcaseExit = "calendar" | "signup";

/** Run details the takeover attaches to funnel events (score, tasks, phase). */
export type ShowcaseEventContext = Record<string, boolean | number | string>;

export type ShortcutShowcaseState = {
  isActive: boolean;
  /**
   * True once markSeen ran this session, so components re-render when the
   * flag flips (a localStorage write notifies nobody). Storage stays the
   * durable source; readers check this OR the stored flag.
   */
  hasSeenShowcase: boolean;
  /** First Skip/Esc arms leave; the second actually skips. */
  skipPending: boolean;
  /** Null for a resumed attempt: same attempt, not a new activation. */
  entry: ShowcaseEntry | null;
};

export const initialShortcutShowcaseState: ShortcutShowcaseState = {
  isActive: false,
  hasSeenShowcase: false,
  skipPending: false,
  entry: null,
};

export const useShortcutShowcaseStore = create<ShortcutShowcaseState>()(() => ({
  ...initialShortcutShowcaseState,
}));

/** Persist the seen flag and wake everyone reading it. */
const markSeen = () => {
  markShortcutShowcaseSeen();
  clearShowcaseProgress();
  useShortcutShowcaseStore.setState({ hasSeenShowcase: true });
};

/** Shared by finish/skip: mark seen so it never auto-launches again. */
const endShowcase = () => {
  markSeen();
  useShortcutShowcaseStore.setState({
    isActive: false,
    skipPending: false,
    entry: null,
  });
};

const activate = (entry: ShowcaseEntry) => {
  useShortcutShowcaseStore.setState({
    isActive: true,
    skipPending: false,
    entry,
  });
  markShowcaseInProgress();
  track("shortcut_showcase_started", { entry });
};

export const shortcutShowcaseActions = {
  /** Palette re-entry: always allowed. The how-to card is one Enter long. */
  replay: () => {
    activate("palette");
  },
  /** A shared ?play=1 link: an explicit request, so no seen-flag gating. */
  startFromLink: () => {
    activate("link");
  },
  /**
   * Re-offer an unfinished attempt after reload, from the how-to card. Does
   * not fire started: this is the same attempt, not a new activation.
   */
  resumeIfInProgress: () => {
    const { isActive } = useShortcutShowcaseStore.getState();
    if (isActive) return;
    if (hasSeenShortcutShowcase()) return;
    if (!hasShowcaseInProgress()) return;
    useShortcutShowcaseStore.setState({
      isActive: true,
      skipPending: false,
      entry: null,
    });
  },
  /** Graduation persists the flag before its reveal animation finishes. */
  markSeen,
  /** The run reached its end screen; context carries outcome and score. */
  recordRunFinished: (context: ShowcaseEventContext) => {
    track("shortcut_showcase_finished", context);
  },
  /** Leaving from the end screen: the finished event already fired. */
  finish: () => {
    endShowcase();
  },
  /**
   * Arm, then confirm, a calendar leave. Skip and Esc call this so a stray
   * Escape does not dump a first-time user onto the calendar. Skip to sign
   * up still calls skip() immediately: that handoff is intentional.
   */
  requestSkip: (
    exit: ShowcaseExit = "calendar",
    context: ShowcaseEventContext = {},
  ) => {
    const { isActive, skipPending } = useShortcutShowcaseStore.getState();
    if (!isActive) return;
    if (skipPending) {
      shortcutShowcaseActions.skip(exit, context);
      return;
    }
    useShortcutShowcaseStore.setState({ skipPending: true });
  },
  clearSkipPending: () => {
    if (!useShortcutShowcaseStore.getState().skipPending) return;
    useShortcutShowcaseStore.setState({ skipPending: false });
  },
  /**
   * Leave immediately and fire skipped. Used by Skip to sign up and by the
   * second Skip/Esc after requestSkip arms the confirm.
   */
  skip: (
    exit: ShowcaseExit = "calendar",
    context: ShowcaseEventContext = {},
  ) => {
    const { isActive } = useShortcutShowcaseStore.getState();
    if (!isActive) return;
    track("shortcut_showcase_skipped", { ...context, exit });
    endShowcase();
  },
};

export const selectShowcaseActive = (state: ShortcutShowcaseState) =>
  state.isActive;

export const selectSkipPending = (state: ShortcutShowcaseState) =>
  state.skipPending;

export const selectShowcaseEntry = (state: ShortcutShowcaseState) =>
  state.entry;

/** Whether the practice takeover should claim the onboarding surface slot. */
export const selectShortcutShowcaseSurfaceEligible = (
  showCalendarOnboarding: boolean,
  isActive: boolean,
): boolean => showCalendarOnboarding && isActive;
