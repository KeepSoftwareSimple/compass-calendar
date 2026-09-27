import {
  type ConnectionState,
  type ConnectionStateReason,
} from "@core/types/sync/connection.contracts";
import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";
import {
  type ConnectFlowKind,
  connectFlowKind,
} from "@web/auth/providers/provider-connect-flow.util";
import { CONSENT_REQUIRED_COPY } from "@web/auth/providers/provider-copy.util";
import {
  type SyncStatus,
  type SyncStatusVariant,
} from "@web/calendars/sync-status.types";

export const MICROSOFT_SELF_HOSTING_DOC_URL =
  "https://github.com/KeepSoftwareSimple/compass-calendar/blob/main/docs/self-hosting/microsoft-calendar.md";

const REAUTH_REASONS: ReadonlySet<ConnectionStateReason> = new Set([
  "authorizationRevoked",
  "authorizationExpired",
  "insufficientScopes",
]);

const REFRESH_REASONS: ReadonlySet<ConnectionStateReason> = new Set([
  "workOverdue",
  "providerErrors",
]);

/** OAuth reconnect copy stays byte-identical for Google. */
export const OAUTH_RECONNECT_COPY = "Calendar needs reconnecting";

const PASSWORD_REAUTH_COPY: Record<
  Extract<
    ConnectionStateReason,
    "authorizationRevoked" | "authorizationExpired" | "insufficientScopes"
  >,
  string
> = {
  authorizationRevoked:
    "App-specific password was rejected. Update your password in Settings.",
  authorizationExpired:
    "App-specific password no longer works. Update it in Settings.",
  insufficientScopes:
    "Compass needs additional calendar access. Update your app-specific password in Settings.",
};

const ATTENTION_FALLBACK_COPY =
  "Calendar updates are taking longer than usual. Try Refresh, or reconnect if this continues.";

const DELAYED_WORK_OVERDUE_SETTINGS =
  "Calendar updates are taking longer than usual.";
const DELAYED_PROVIDER_ERRORS_SETTINGS = "Couldn't update your calendar.";
const DELAYED_WORK_OVERDUE_SIDEBAR = "Calendar updates are delayed";
const DELAYED_PROVIDER_ERRORS_SIDEBAR = "Couldn't update your calendar";

export type HealthCopySurface = "settings" | "sidebarShort";

export type HealthCopyContext = {
  state: ConnectionState | string;
  stateReason: ConnectionStateReason | string | null;
  credentialKind: ConnectFlowKind;
  surface: HealthCopySurface;
  lastUpdatedSuffix?: string;
};

export type HealthNextAction =
  | "reconnect"
  | "refresh"
  | "updatePassword"
  | "learnMore"
  | null;

export function credentialKindForConnection(
  connection: Pick<SyncConnectionSummary, "provider"> | null | undefined,
): ConnectFlowKind {
  return connectFlowKind(connection?.provider ?? "google");
}

export function isReauthReason(
  reason: ConnectionStateReason | string | null | undefined,
): reason is Extract<
  ConnectionStateReason,
  "authorizationRevoked" | "authorizationExpired" | "insufficientScopes"
> {
  return reason != null && REAUTH_REASONS.has(reason as ConnectionStateReason);
}

export function isRefreshReason(
  reason: ConnectionStateReason | string | null | undefined,
): reason is Extract<ConnectionStateReason, "workOverdue" | "providerErrors"> {
  return reason != null && REFRESH_REASONS.has(reason as ConnectionStateReason);
}

/** Full user-facing status string for a state + reason + credential kind. */
export function connectionHealthCopy(ctx: HealthCopyContext): string | null {
  const {
    state,
    stateReason,
    credentialKind,
    surface,
    lastUpdatedSuffix = "",
  } = ctx;

  if (stateReason === "consentRequired") {
    return CONSENT_REQUIRED_COPY;
  }

  if (state === "delayed" || stateReason === "workOverdue") {
    const base =
      stateReason === "providerErrors"
        ? surface === "sidebarShort"
          ? DELAYED_PROVIDER_ERRORS_SIDEBAR
          : DELAYED_PROVIDER_ERRORS_SETTINGS
        : surface === "sidebarShort"
          ? DELAYED_WORK_OVERDUE_SIDEBAR
          : DELAYED_WORK_OVERDUE_SETTINGS;
    if (surface === "sidebarShort") return base;
    return `${base}${lastUpdatedSuffix} Try Refresh, or reconnect if this continues.`;
  }

  if (stateReason === "providerErrors") {
    const base =
      surface === "sidebarShort"
        ? DELAYED_PROVIDER_ERRORS_SIDEBAR
        : DELAYED_PROVIDER_ERRORS_SETTINGS;
    if (surface === "sidebarShort") return base;
    return `${base}${lastUpdatedSuffix} Try Refresh, or reconnect if this continues.`;
  }

  if (
    state === "actionRequired" ||
    state === "disconnected" ||
    isReauthReason(stateReason)
  ) {
    if (credentialKind === "credentialForm" && isReauthReason(stateReason)) {
      return PASSWORD_REAUTH_COPY[stateReason];
    }
    return OAUTH_RECONNECT_COPY;
  }

  if (state === "actionRequired" && stateReason === "consentRequired") {
    return CONSENT_REQUIRED_COPY;
  }

  if (state === "actionRequired" && isRefreshReason(stateReason)) {
    const base =
      stateReason === "providerErrors"
        ? DELAYED_PROVIDER_ERRORS_SETTINGS
        : DELAYED_WORK_OVERDUE_SETTINGS;
    return `${base}${lastUpdatedSuffix} Try Refresh, or reconnect if this continues.`;
  }

  return null;
}

export function connectionHealthNextAction(
  state: ConnectionState | string,
  stateReason: ConnectionStateReason | string | null,
  credentialKind: ConnectFlowKind,
): HealthNextAction {
  if (stateReason === "consentRequired") return "learnMore";
  if (isRefreshReason(stateReason) || state === "delayed") return "refresh";
  if (credentialKind === "credentialForm" && isReauthReason(stateReason)) {
    return "updatePassword";
  }
  if (
    state === "actionRequired" ||
    state === "disconnected" ||
    isReauthReason(stateReason)
  ) {
    return "reconnect";
  }
  return null;
}

export function attentionFallbackCopy(): string {
  return ATTENTION_FALLBACK_COPY;
}

export function nameAccountInCopy(
  copy: string,
  accountEmail: string | null | undefined,
  genericReconnectCopy: string = OAUTH_RECONNECT_COPY,
): string {
  const named = accountEmail?.trim();
  if (!named) return copy;
  if (copy === genericReconnectCopy) {
    return `${named} needs reconnecting`;
  }
  return copy;
}

const CONNECTION_STATE_PRECEDENCE: readonly GoogleConnectionState[] = [
  "RECONNECT_REQUIRED",
  "ATTENTION",
  "IMPORTING",
  "HEALTHY",
];

function connectionPrecedenceRank(
  connectionState: GoogleConnectionState,
): number {
  const index = CONNECTION_STATE_PRECEDENCE.indexOf(connectionState);
  return index === -1 ? CONNECTION_STATE_PRECEDENCE.length : index;
}

export type SidebarStatusEntry = {
  connection: SyncConnectionSummary;
  status: { variant: SyncStatusVariant; text: string };
};

/** Pick one sidebar line when multiple accounts need attention. Names the account when messages disagree. */
export function pickAggregateSidebarStatus(
  entries: readonly SidebarStatusEntry[],
): SyncStatus | null {
  if (entries.length === 0) return null;
  if (entries.length === 1) return entries[0]!.status;

  const sorted = [...entries].sort(
    (left, right) =>
      connectionPrecedenceRank(left.connection.connectionState) -
      connectionPrecedenceRank(right.connection.connectionState),
  );
  const top = sorted[0]!;
  const distinctTexts = new Set(sorted.map((entry) => entry.status.text));

  if (distinctTexts.size > 1 || sorted.length > 1) {
    return {
      variant: top.status.variant,
      text: nameAccountInCopy(top.status.text, top.connection.accountEmail),
    };
  }

  return top.status;
}
