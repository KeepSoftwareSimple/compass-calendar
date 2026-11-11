import { CONFIG } from "@backend/common/constants/config.constants";
import {
  type WelcomeStepKey,
  welcomeStepValue,
} from "@backend/email/welcome-sequence";

export type WelcomeEmailContentEntry = {
  subject: string;
  heading: string;
  paragraphs: readonly string[];
  cta: {
    label: string;
    href: string;
  };
};

const appUrl = (): string => CONFIG.FRONTEND_URL.replace(/\/$/, "");

const billingSettingsHref = (): string => `${appUrl()}/?settings=billing`;

// TODO(copy): replace placeholder welcome drip copy before launch.
/**
 * Placeholder copy for the welcome drip. Real copy replaces this file only.
 *
 * CTA links must land on URLs calendar-web handles. Settings is a modal, not
 * a route, so `/settings/...` paths 404. `?settings=<page>` opens the modal
 * on that page (useSettingsSearchEntry) and `?meetingSetup=1` opens meeting
 * setup (useGuestMeetingSetupEntry). The email layout appends utm params, so
 * every href here must tolerate extra query params.
 */
export const WELCOME_SEQUENCE_CONTENT: Record<
  WelcomeStepKey,
  WelcomeEmailContentEntry
> = {
  "cmd-k": {
    subject: "Welcome to Compass Calendar (0/5)",
    heading: "Welcome aboard",
    paragraphs: [
      "Compass is designed to be driven with the keyboard.",
      "Press Cmd/Ctrl + K to open the command palette.",
    ],
    cta: {
      label: "Open Compass",
      href: appUrl(),
    },
  },
  "shortcut-list": {
    subject: '"?" (1/5)',
    heading: "Forgot a shortcut?",
    paragraphs: [
      "Type ? to open the master shortcut list, then type to filter it.",
    ],
    cta: {
      label: "Try it",
      href: appUrl(),
    },
  },
  "jump-around": {
    subject: "Jumping (CMD/CTRL, f) (2/5)",
    heading: "Jump around",
    paragraphs: [
      "Hold Cmd/Ctrl to reveal shortcuts, or type f to flash jump keys.",
    ],
    cta: {
      label: "Try it now",
      href: appUrl(),
    },
  },
  "adjusting-times": {
    subject: "Repositioning (SHIFT+↑↓←→) (3/5)",
    heading: "Adjust times fast",
    paragraphs: [
      "While focused on an event, type Shift + arrow keys to move it.",
    ],
    cta: {
      label: "Lay down some blocks",
      href: appUrl(),
    },
  },
  roundup: {
    subject: "Roundup (4/5)",
    heading: "Roundup",
    paragraphs: [
      'Type g to go to a date, Cmd/Ctrl + Z to undo, and "meet" in the palette for your meeting page.',
    ],
    cta: {
      label: "Open Compass",
      href: appUrl(),
    },
  },
  "weekly-review": {
    subject: "Your weekly review (5/5)",
    heading: "A little time to reflect",
    paragraphs: [
      "Your weekly review brings together highlights from the past week, meaningful plans ahead, and memories from your calendar history.",
      "Your reviews arrive automatically every Sunday at 10:30 a.m. in your selected timezone.",
      "Open Settings > Notifications to pause or re-enable reviews and see your notification preferences. Calendar visibility controls which calendars appear in your review.",
    ],
    cta: {
      label: "Customize your notifications",
      href: `${appUrl()}/?settings=notifications`,
    },
  },
  "trial-ending": {
    subject: "Your trial is ending soon",
    heading: "Your trial ends in two days",
    paragraphs: [
      "Your card on file will be charged when the trial ends so your workspace stays active.",
      "Review your plan anytime in Settings > Billing.",
    ],
    cta: {
      label: "View billing",
      href: billingSettingsHref(),
    },
  },
};

export function getWelcomeEmailContent(
  stepKey: string,
): WelcomeEmailContentEntry | undefined {
  return welcomeStepValue(WELCOME_SEQUENCE_CONTENT, stepKey);
}
