import { CONFIG } from "@backend/common/constants/config.constants";

export type WelcomeEmailContentEntry = {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: readonly string[];
  cta: {
    label: string;
    href: string;
  };
};

const appUrl = (): string => CONFIG.FRONTEND_URL.replace(/\/$/, "");

// TODO(copy): replace placeholder welcome drip copy before launch.
/** Placeholder copy for the welcome drip. Real copy replaces this file only. */
export const WELCOME_SEQUENCE_CONTENT: Record<
  string,
  WelcomeEmailContentEntry
> = {
  welcome: {
    subject: "Welcome to Compass Calendar",
    preheader: "Your calendar, organized.",
    heading: "Welcome aboard",
    paragraphs: [
      "Compass Calendar keeps your days clear and your meetings under control.",
      "Open the app to see your week at a glance.",
    ],
    cta: {
      label: "Open Compass",
      href: appUrl(),
    },
  },
  shortcuts: {
    subject: "Keyboard shortcuts that save time",
    preheader: "Move faster with a few keys.",
    heading: "Work at the speed of thought",
    paragraphs: [
      "Jump between days, create events, and search without leaving the keyboard.",
      "Press ? in the app to see the full list.",
    ],
    cta: {
      label: "Try shortcuts",
      href: `${appUrl()}/?welcome=shortcuts`,
    },
  },
  "connect-calendar": {
    subject: "Connect your calendar",
    preheader: "Bring Google or Microsoft into Compass.",
    heading: "See everything in one place",
    paragraphs: [
      "Link the account you already use so Compass stays in sync.",
      "You can add more calendars later from Settings.",
    ],
    cta: {
      label: "Connect a calendar",
      href: `${appUrl()}/settings`,
    },
  },
  booking: {
    subject: "Share your availability",
    preheader: "Let guests book time with you.",
    heading: "Booking pages in minutes",
    paragraphs: [
      "Create a booking link with the hours you want to offer.",
      "Guests pick a slot and you both get a calendar event.",
    ],
    cta: {
      label: "Set up booking",
      href: `${appUrl()}/settings/booking`,
    },
  },
  "trial-ending": {
    subject: "Your trial is ending soon",
    preheader: "Keep your workspace when the trial ends.",
    heading: "Stay on Compass",
    paragraphs: [
      "Your trial gives you full access while you explore.",
      "Subscribe before it ends to keep creating and syncing without interruption.",
    ],
    cta: {
      label: "View billing",
      href: `${appUrl()}/settings/billing`,
    },
  },
};

export function getWelcomeEmailContent(
  stepKey: string,
): WelcomeEmailContentEntry | undefined {
  return WELCOME_SEQUENCE_CONTENT[stepKey];
}
