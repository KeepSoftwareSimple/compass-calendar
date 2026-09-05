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

/** Heading for the first-connect onboarding step and the multi-provider chooser. */
export const CONNECT_THE_CALENDAR_YOU_USE = "Connect the calendar you use";

/** Spec host-explainer: Apple Calendar.app is not the same as iCloud hosting. */
export const CALENDAR_HOST_EXPLAINER =
  "If you view your calendar in Apple Calendar, it may still be hosted by Google or Microsoft.";

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
    "Connect a Google account to enable your booking page. Guests book through a public link and Compass creates events on your calendar.",
  microsoft:
    "Connect a Microsoft account to enable your booking page. Guests book through a public link and Compass creates events on your calendar.",
  apple:
    "Connect an Apple account to enable your booking page. Guests book through a public link and Compass creates events on your calendar.",
};

export function bookingConnectPromptCopy(
  connectable: readonly ProviderKind[],
): string {
  if (connectable.length <= 1) {
    return BOOKING_CONNECT_PROMPT[connectable[0] ?? "google"];
  }
  return "Connect a calendar account to enable your booking page. Guests book through a public link and Compass creates events on your calendar.";
}

export const BOOKING_CONNECT_BUTTON_LABEL: Record<ProviderKind, string> = {
  google: "Connect Google",
  microsoft: CONNECT_CALENDAR_LABEL.microsoft,
  apple: CONNECT_CALENDAR_LABEL.apple,
};

export function defaultCalendarGroupLabel(
  accountEmail: string,
  kind: ProviderKind,
): string {
  return `${accountEmail} (${providerDisplayName(kind)})`;
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
