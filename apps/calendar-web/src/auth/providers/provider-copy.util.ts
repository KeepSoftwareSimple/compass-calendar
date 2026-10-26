import {
  type ProviderKind,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { type GoogleUiConfig } from "@web/auth/providers/connect.types";

export function connectionProvider(
  connection: Pick<SyncConnectionSummary, "provider"> | null | undefined,
): ProviderKind {
  return connection?.provider ?? "google";
}

export const CALENDAR_PRODUCT_NAME: Record<ProviderKind, string> = {
  google: "Google Calendar",
  microsoft: "Microsoft Calendar",
  apple: "Apple Calendar",
};

/** Sidebar multi-provider connect button when no calendar is linked yet. */
export const CONNECT_THE_CALENDAR_YOU_USE = "Connect the calendar you use";

export const CONNECT_CALENDAR_REASSURANCE =
  "Compass only touches calendar events, and you can disconnect the account anytime from Settings.";

/** Spec host-explainer: Apple Calendar.app is not the same as iCloud hosting. */
export const CALENDAR_HOST_EXPLAINER =
  "If you view your calendar in Apple Calendar, it may still be hosted by Google or Microsoft.";

/** Anonymous local-only calendar row and onboarding device-only path. */
export const LOCAL_DEVICE_ONLY_LABEL = "On this device only";

export const LOCAL_DEVICE_ONLY_SUBTITLE =
  "Events stay in this browser until you connect an account.";

/** Settings and sign-in add-account chooser trigger. */
export const CONNECT_CALENDAR_ACCOUNT_LABEL = "Connect a calendar account";

export const CONNECT_CALENDAR_ACCOUNT_HELPER =
  "Pick Google, Microsoft, or Apple. Or keep using this device only from the calendar list.";

/** Admin-consent required (Microsoft Graph `consentRequired`). */
export const CONSENT_REQUIRED_COPY =
  "Your organization's admin has to approve Compass before this account can connect.";

export function calendarProductName(kind: ProviderKind): string {
  return CALENDAR_PRODUCT_NAME[kind];
}

export const CONNECT_CALENDAR_LABEL: Record<ProviderKind, string> = {
  google: "Connect Google Calendar",
  microsoft: "Connect Microsoft Calendar",
  apple: "Connect Apple Calendar",
};

/** Anonymous connect chooser copy (Trial v2): trial framing before OAuth. */
export const ANONYMOUS_TRIAL_CONNECT_CALENDAR_LABEL: Record<
  ProviderKind,
  string
> = {
  google: "Start your free trial to connect Google",
  microsoft: "Start your free trial to connect Microsoft",
  apple: "Start your free trial to connect Apple",
};

export const RECONNECT_CALENDAR_LABEL: Record<ProviderKind, string> = {
  google: "Reconnect Google Calendar",
  microsoft: "Reconnect Microsoft Calendar",
  apple: "Reconnect Apple Calendar",
};

export const RECONNECT_BANNER_MESSAGE: Record<ProviderKind, string> = {
  google: "Google Calendar needs reconnecting.",
  microsoft: "Microsoft Calendar needs reconnecting.",
  apple: "Apple Calendar needs reconnecting.",
};

const EMPTY_CALENDARS_COPY: Record<ProviderKind, string> = {
  google: "Connect Google to see your calendars.",
  microsoft: "Connect Microsoft to see your calendars.",
  apple: "Connect Apple to see your calendars.",
};

const EVENTS_SAFE_PLACE: Record<ProviderKind, string> = {
  google: "Google",
  microsoft: "Microsoft",
  apple: "Apple",
};

export function openingProviderCopy(kind: ProviderKind): string {
  return `Opening ${providerDisplayName(kind)}…`;
}

export function emptyCalendarsCopy(
  connectable: readonly ProviderKind[],
): string {
  if (connectable.length === 1) {
    return EMPTY_CALENDARS_COPY[connectable[0]!];
  }
  return "Connect a calendar to see your calendars.";
}

const BOOKING_CONNECT_PROMPT: Record<ProviderKind, string> = {
  google:
    "Connect a Google account to enable your meeting page. Guests book through a public link and Compass creates events on your calendar.",
  microsoft:
    "Connect a Microsoft account to enable your meeting page. Guests book through a public link and Compass creates events on your calendar.",
  apple:
    "Connect an Apple account to enable your meeting page. Guests book through a public link and Compass creates events on your calendar.",
};

export function bookingConnectPromptCopy(
  connectable: readonly ProviderKind[],
): string {
  if (connectable.length <= 1) {
    return BOOKING_CONNECT_PROMPT[connectable[0] ?? "google"];
  }
  return "Connect a calendar account to enable your meeting page. Guests book through a public link and Compass creates events on your calendar.";
}

export function reconnectToastTitle(
  kind: ProviderKind,
  accountEmail?: string | null,
): string {
  const product = calendarProductName(kind);
  const named = accountEmail?.trim();
  return named
    ? `${product} disconnected (${named})`
    : `${product} disconnected`;
}

export function reconnectToastBody(
  kind: ProviderKind,
  accountEmail?: string | null,
): string {
  const named = accountEmail?.trim();
  const safePlace = EVENTS_SAFE_PLACE[kind];
  if (named) {
    return `Access for ${named} expired or was revoked. Your events are still safe in ${safePlace}. Reconnect and Compass will re-import them.`;
  }
  return `This happens when access expires or is revoked. Your events are still safe in ${safePlace}. Reconnect and Compass will re-import them.`;
}

export function reconnectPointerHint(kind: ProviderKind): string {
  return `Press G to reconnect ${calendarProductName(kind)}.`;
}

export const MISSING_PERMISSIONS_TITLE = "Compass needs calendar access";

export const GOOGLE_SIGNUP_SCOPES_RECOVERY_TITLE =
  "Compass needs access to your Google Calendar";

export const GOOGLE_SIGNUP_SCOPES_RECOVERY_MESSAGE =
  "Compass needs Google Calendar access to show and sync your events. Try again and allow calendar access on the next screen.";

export const GOOGLE_SIGNUP_SCOPES_RECOVERY_RETRY_LABEL = "Try again";

export const MISSING_PERMISSIONS_INTRO: Record<ProviderKind, string> = {
  google:
    "Google let you skip some permissions, and Compass can't sync without them. Here is what each one is for:",
  microsoft:
    "Microsoft let you skip some permissions, and Compass can't sync without them. Here is what each one is for:",
  apple: "",
};

export const REQUESTED_PERMISSIONS: Record<
  ProviderKind,
  readonly { name: string; why: string }[]
> = {
  google: [
    {
      name: "See your email address",
      why: "Tells Compass which Google account you signed in with.",
    },
    {
      name: "See your calendars",
      why: "Shows the events already on your calendar in the week view.",
    },
    {
      name: "View and edit events on your calendars",
      why: "Lets you create and change events from Compass and keeps Google in step, both ways.",
    },
  ],
  microsoft: [
    {
      name: "Sign you in and read your profile",
      why: "Tells Compass which Microsoft account you signed in with.",
    },
    {
      name: "Maintain access you have given it",
      why: "Keeps your calendar syncing after you close the tab.",
    },
    {
      name: "Read and write your calendars",
      why: "Shows your events and lets Compass create and change them, both ways.",
    },
  ],
  apple: [],
};

export const MISSING_PERMISSIONS_NOT_NOW_LABEL = "Not now";

export function missingPermissionsRetryLabel(kind: ProviderKind): string {
  return `Try again with ${providerDisplayName(kind)}`;
}

export function relabelConnectCommand(
  commandAction: GoogleUiConfig["commandAction"],
  kind: ProviderKind,
): GoogleUiConfig["commandAction"] {
  if (!commandAction) return null;
  if (commandAction.label === CONNECT_CALENDAR_LABEL.google) {
    return { ...commandAction, label: CONNECT_CALENDAR_LABEL[kind] };
  }
  if (commandAction.label === RECONNECT_CALENDAR_LABEL.google) {
    return { ...commandAction, label: RECONNECT_CALENDAR_LABEL[kind] };
  }
  return commandAction;
}
