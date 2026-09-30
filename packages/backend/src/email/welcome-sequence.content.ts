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
      href: appUrl(),
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
      href: `${appUrl()}/?settings=accounts`,
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
      href: `${appUrl()}/?meetingSetup=1`,
    },
  },
  "trial-ending": {
    subject: "Your trial is ending soon",
    preheader: "Your card will be charged when the trial ends.",
    heading: "Your trial ends in two days",
    paragraphs: [
      "Your card on file will be charged when the trial ends so your workspace stays active.",
      "Review your plan anytime in Settings > Billing.",
    ],
    cta: {
      label: "View billing",
      href: `${appUrl()}/?settings=billing`,
    },
  },
};

export function getWelcomeEmailContent(
  stepKey: string,
): WelcomeEmailContentEntry | undefined {
  return WELCOME_SEQUENCE_CONTENT[stepKey];
}
