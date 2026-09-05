import {
  type ProviderKind,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { type GoogleUiConfig } from "@web/auth/google/hooks/useConnectGoogle/useConnectGoogle.types";

export function connectionProvider(
  connection: Pick<SyncConnectionSummary, "provider"> | null | undefined,
): ProviderKind {
  return connection?.provider ?? "google";
}

export const CALENDAR_PRODUCT_NAME: Record<ProviderKind, string> = {
  google: "Google Calendar",
  microsoft: "Outlook",
  apple: "Apple Calendar",
};

export function calendarProductName(kind: ProviderKind): string {
  return CALENDAR_PRODUCT_NAME[kind];
}

export const CONNECT_CALENDAR_LABEL: Record<ProviderKind, string> = {
  google: "Connect Google Calendar",
  microsoft: "Connect Outlook",
  apple: "Connect Apple Calendar",
};

export const RECONNECT_CALENDAR_LABEL: Record<ProviderKind, string> = {
  google: "Reconnect Google Calendar",
  microsoft: "Reconnect Outlook",
  apple: "Reconnect Apple Calendar",
};

export const RECONNECT_BANNER_MESSAGE: Record<ProviderKind, string> = {
  google: "Google Calendar needs reconnecting.",
  microsoft: "Outlook needs reconnecting.",
  apple: "Apple Calendar needs reconnecting.",
};

const EMPTY_CALENDARS_COPY: Record<ProviderKind, string> = {
  google: "Connect Google to see your calendars.",
  microsoft: "Connect Microsoft to see your calendars.",
  apple: "Connect Apple to see your calendars.",
};

const EVENTS_SAFE_PLACE: Record<ProviderKind, string> = {
  google: "Google",
  microsoft: "Outlook",
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
