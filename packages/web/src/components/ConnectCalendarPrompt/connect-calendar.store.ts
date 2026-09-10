import { create } from "zustand";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import {
  CONNECT_CALENDAR_SNOOZE_MS,
  isConnectCalendarPromptSnoozed,
  markConnectCalendarPromptSnoozed,
} from "@web/components/ConnectCalendarPrompt/connect-calendar.storage";

export type ConnectCalendarPromptState = {
  isSnoozed: boolean;
};

const SNOOZE_DAYS = CONNECT_CALENDAR_SNOOZE_MS / (24 * 60 * 60 * 1000);

// Read once, at module load. A snooze that lapses mid-session surfaces on the
// next load, which is the right cadence for an onboarding nudge and saves a
// timer.
export const initialConnectCalendarPromptState: ConnectCalendarPromptState = {
  isSnoozed: isConnectCalendarPromptSnoozed(),
};

export const useConnectCalendarPromptStore = create<ConnectCalendarPromptState>(
  () => ({
    ...initialConnectCalendarPromptState,
  }),
);

// Module scope, not a component ref: the gate unmounts the prompt whenever
// Settings, About or the Apple form opens, so a ref would re-fire the
// impression on every reopen.
let hasTrackedShown = false;

export const connectCalendarPromptActions = {
  markShown: () => {
    if (hasTrackedShown) return;
    hasTrackedShown = true;
    trackSignupStep("connect_prompt_shown");
  },
  snooze: () => {
    // Same event name as when dismissing was permanent, so existing insights
    // keep working; the added property records that it now comes back.
    track("connect_calendar_prompt_dismissed", { snooze_days: SNOOZE_DAYS });
    markConnectCalendarPromptSnoozed();
    useConnectCalendarPromptStore.setState({ isSnoozed: true });
  },
};

export const resetConnectCalendarPromptStoreForTests = (): void => {
  hasTrackedShown = false;
  // Re-derived rather than replayed from the frozen initial state: the reset
  // helpers clear storage first, and a stale `true` here would outlive it.
  useConnectCalendarPromptStore.setState(
    { isSnoozed: isConnectCalendarPromptSnoozed() },
    true,
  );
};

export const selectConnectCalendarPromptSnoozed = (
  state: ConnectCalendarPromptState,
): boolean => state.isSnoozed;
