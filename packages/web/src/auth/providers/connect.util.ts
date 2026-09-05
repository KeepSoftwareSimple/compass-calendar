import { ArrowsClockwiseIcon, CloudArrowUpIcon } from "@phosphor-icons/react";
import {
  type ProviderKind,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import { CONSENT_REQUIRED_COPY } from "@web/auth/providers/provider-copy.util";
import {
  isAccountReconnectRequired,
  isConnectionReconnectRequired,
} from "@web/auth/providers/reconnect.state";
import { type SyncStatus } from "@web/calendars/sync-status.types";
import {
  type CommandActionIcon,
  type GoogleUiConfig,
  type GoogleUiState,
} from "./connect.types";

const RECONNECT_STATUS: SyncStatus = {
  variant: "error",
  text: "Calendar needs reconnecting",
};

const CONSENT_REQUIRED_STATUS: SyncStatus = {
  variant: "error",
  text: CONSENT_REQUIRED_COPY,
};

const connectionNeedsAdminConsent = (
  connection?: GoogleSyncConnectionSummary | null,
): boolean => connection?.stateReason === "consentRequired";

// Settings lists every account as its own row (email visible right above this
// text), so a generic message there is unambiguous. The sidebar's status bar
// collapses every account into one line with no account context at all - with
// multiple accounts connected, "Calendar needs reconnecting" doesn't say
// which one, and the user has to open Settings just to find out. Named only
// in getSidebarSyncStatus's own reconnect returns, below.
const reconnectStatusFor = (accountEmail?: string | null): SyncStatus =>
  accountEmail
    ? { variant: "error", text: `${accountEmail} needs reconnecting` }
    : RECONNECT_STATUS;

/** Sync disconnected / product reconnect / session override after a live 410. */
export const connectionHasReconnectRequired = (
  connection?: GoogleSyncConnectionSummary | null,
): boolean =>
  connection?.connectionState === "RECONNECT_REQUIRED" ||
  connection?.state === "disconnected" ||
  isConnectionReconnectRequired(connection?.id) ||
  isAccountReconnectRequired(connection?.accountEmail);

/** Aggregate UI state or a specific connection needs reconnect. */
export const connectionNeedsReconnect = (
  state: GoogleUiState,
  connection?: GoogleSyncConnectionSummary | null,
): boolean =>
  state === "RECONNECT_REQUIRED" || connectionHasReconnectRequired(connection);

const CONNECT_ICON: CommandActionIcon = CloudArrowUpIcon;
const REFRESH_ICON: CommandActionIcon = ArrowsClockwiseIcon;
const CONNECTED_STATUS: SyncStatus = {
  variant: "healthy",
  text: "Calendar connected",
};

// Shown instead of CONNECTED_STATUS (never over a reconnect/attention/syncing
// status - those already say something more urgent) when the live SSE stream
// has been down long enough that "connected" and its freshness timestamp can
// no longer be trusted. See useSseDegraded / sse.client.ts.
export const SSE_DEGRADED_STATUS: SyncStatus = {
  variant: "warning",
  text: "Reconnecting live updates…",
};

// Plain backlog under this age stays silent in the sidebar and reads as
// connected in Settings. Matches the short provider-error delay band so a
// freshly clicked Refresh does not invent its own warning.
export const CATCHING_UP_NOTICE_AFTER_MS = 2 * 60 * 1000;

const SUPPORT_EMAIL = "tyler@switchback.tech";
export const googleSyncSupportMailto = `mailto:${SUPPORT_EMAIL}`;

/** Short relative label for Sync connection `lastSyncedAt` (ISO). */
export const formatLastSyncedLabel = (
  lastSyncedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null => {
  if (!lastSyncedAt) {
    return null;
  }

  const syncedMs = Date.parse(lastSyncedAt);
  if (Number.isNaN(syncedMs)) {
    return null;
  }

  const deltaSec = Math.max(0, Math.floor((nowMs - syncedMs) / 1000));
  if (deltaSec < 60) {
    return "Updated just now";
  }

  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) {
    return deltaMin === 1
      ? "Updated 1 minute ago"
      : `Updated ${deltaMin} minutes ago`;
  }

  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) {
    return deltaHr === 1
      ? "Updated 1 hour ago"
      : `Updated ${deltaHr} hours ago`;
  }

  const deltaDay = Math.floor(deltaHr / 24);
  if (deltaDay < 7) {
    return deltaDay === 1
      ? "Updated 1 day ago"
      : `Updated ${deltaDay} days ago`;
  }

  return `Updated ${new Date(syncedMs).toLocaleDateString()}`;
};

/** Mid-sentence form of formatLastSyncedLabel ("Last updated …"). */
export const formatLastUpdatedClause = (
  lastSyncedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null => {
  const label = formatLastSyncedLabel(lastSyncedAt, nowMs);
  if (!label) return null;
  return label.replace(/^Updated /, "Last updated ");
};

const syncedAgeMs = (
  lastSyncedAt: string | null | undefined,
  nowMs: number,
): number | null => {
  if (!lastSyncedAt) return null;
  const syncedMs = Date.parse(lastSyncedAt);
  if (Number.isNaN(syncedMs)) return null;
  return Math.max(0, nowMs - syncedMs);
};

/** ` Last updated ….` suffix, or empty when unknown. */
const lastUpdatedSuffix = (
  lastSyncedAt: string | null | undefined,
  nowMs: number,
): string => {
  const last = formatLastUpdatedClause(lastSyncedAt, nowMs);
  return last ? ` ${last}.` : "";
};

const stuckReconnectStatus = (lastBit: string): SyncStatus => ({
  variant: "error",
  text: `We couldn't update your calendar.${lastBit} Reconnect, or email ${SUPPORT_EMAIL} for help.`,
});

const catchingUpDetailStatus = (lastBit: string): SyncStatus => ({
  variant: "syncing",
  text: `Syncing in the background…${lastBit} This usually finishes on its own.`,
});

export type GoogleConnectionHandlers = {
  onConnectGoogle: () => void;
  onRefreshGoogle: () => void;
};

export type GoogleConnectionConfigOptions = {
  // Refresh was requested and the degraded state did not improve — stop
  // offering the same Refresh button; offer reconnect + support instead.
  refreshGaveUp?: boolean;
  provider?: ProviderKind;
};

const connectCalendarLabel = (provider: ProviderKind): string =>
  `Connect ${providerDisplayName(provider)} Calendar`;

const reconnectCalendarLabel = (provider: ProviderKind): string =>
  `Reconnect ${providerDisplayName(provider)} Calendar`;

export const getGoogleConnectionConfig = (
  state: GoogleUiState,
  handlers: GoogleConnectionHandlers,
  options: GoogleConnectionConfigOptions = {},
): GoogleUiConfig => {
  const provider = options.provider ?? "google";
  switch (state) {
    case "checking":
    case "IMPORTING":
    case "HEALTHY":
      return { commandAction: null };
    case "ATTENTION":
      if (options.refreshGaveUp) {
        return {
          commandAction: {
            label: reconnectCalendarLabel(provider),
            icon: CONNECT_ICON,
            onSelect: handlers.onConnectGoogle,
          },
        };
      }
      return {
        commandAction: {
          label: "Refresh calendar",
          icon: REFRESH_ICON,
          onSelect: handlers.onRefreshGoogle,
        },
      };
    case "NOT_CONNECTED":
      return {
        commandAction: {
          label: connectCalendarLabel(provider),
          icon: CONNECT_ICON,
          onSelect: handlers.onConnectGoogle,
        },
      };
    case "RECONNECT_REQUIRED":
      return {
        commandAction: {
          label: reconnectCalendarLabel(provider),
          icon: CONNECT_ICON,
          onSelect: handlers.onConnectGoogle,
        },
      };
  }
};

export const calendarReconnectBannerMessage = (
  provider: ProviderKind,
): string => `${providerDisplayName(provider)} Calendar needs reconnecting.`;

const delayedSettingsStatus = (
  connection: GoogleSyncConnectionSummary,
  nowMs: number,
): SyncStatus => {
  const lastBit = lastUpdatedSuffix(connection.lastSyncedAt, nowMs);
  if (connection.stateReason === "providerErrors") {
    return {
      variant: "warning",
      text: `Couldn't update your calendar.${lastBit} Try Refresh, or reconnect if this continues.`,
    };
  }
  return {
    variant: "warning",
    text: `Calendar updates are taking longer than usual.${lastBit} Try Refresh, or reconnect if this continues.`,
  };
};

const catchingUpSettingsStatus = (
  connection: GoogleSyncConnectionSummary,
  nowMs: number,
): SyncStatus => {
  if (!connection.lastHealthyAt) {
    return { variant: "syncing", text: "Adding your calendar…" };
  }
  const ageMs = syncedAgeMs(connection.lastSyncedAt, nowMs);
  if (ageMs === null || ageMs < CATCHING_UP_NOTICE_AFTER_MS) {
    return CONNECTED_STATUS;
  }
  return catchingUpDetailStatus(
    lastUpdatedSuffix(connection.lastSyncedAt, nowMs),
  );
};

export type GoogleSyncStatusOptions = {
  refreshGaveUp?: boolean;
  refreshInFlight?: boolean;
};

// Prefer Sync vocabulary when a connection summary is present; fall back to the
// collapsed product enum for legacy deployments. Reconnect-required always wins
// over healthy/catchingUp so a stale Sync summary cannot contradict a toast.
export const getGoogleSyncStatus = (
  state: GoogleUiState,
  connection?: GoogleSyncConnectionSummary | null,
  nowMs: number = Date.now(),
  options: GoogleSyncStatusOptions = {},
): SyncStatus => {
  if (connectionNeedsAdminConsent(connection)) {
    return CONSENT_REQUIRED_STATUS;
  }

  if (connectionNeedsReconnect(state, connection)) {
    return RECONNECT_STATUS;
  }

  // A connection summary describes durable provider work. Local metadata
  // loading and a routine incremental pull must not replace a calm, usable
  // calendar with transient "checking" or "syncing" copy.
  if (connection) {
    if (options.refreshGaveUp && connection.state === "delayed") {
      return stuckReconnectStatus(
        lastUpdatedSuffix(connection.lastSyncedAt, nowMs),
      );
    }

    if (options.refreshInFlight && connection.state === "delayed") {
      return catchingUpDetailStatus(
        lastUpdatedSuffix(connection.lastSyncedAt, nowMs),
      );
    }

    switch (connection.state) {
      case "healthy":
        return CONNECTED_STATUS;
      case "connecting":
      case "importing":
        return connection.lastHealthyAt
          ? CONNECTED_STATUS
          : { variant: "syncing", text: "Adding your calendar…" };
      case "catchingUp":
        return catchingUpSettingsStatus(connection, nowMs);
      case "delayed":
        return delayedSettingsStatus(connection, nowMs);
      case "actionRequired":
      case "disconnected":
        // Product enum already distinguishes reconnect vs soft attention.
        break;
    }
  }

  switch (state) {
    case "checking":
      return null;
    case "IMPORTING":
      return { variant: "syncing", text: "Adding your calendar…" };
    case "HEALTHY":
      return CONNECTED_STATUS;
    case "ATTENTION":
      if (options.refreshGaveUp) {
        return stuckReconnectStatus("");
      }
      return {
        variant: "warning",
        text: "Calendar updates are taking longer than usual. Try Refresh, or reconnect if this continues.",
      };
    case "RECONNECT_REQUIRED":
      return RECONNECT_STATUS;
    case "NOT_CONNECTED":
      return null;
  }
};

/**
 * Whether this connection's FIRST-EVER import is still running, as opposed to
 * a routine incremental catch-up on an already-established account. Both
 * collapse to the same aggregate "IMPORTING" product state, so a caller that
 * only checks that (e.g. the grid's empty-week overlay, before this was
 * introduced) would treat ordinary background catch-up like a brand-new
 * first import. lastHealthyAt is the one signal that distinguishes them: it
 * is set once, the first time the connection ever finishes healthy, and
 * never cleared.
 */
export const isFirstImportInProgress = (
  connection?: GoogleSyncConnectionSummary | null,
): boolean =>
  Boolean(
    connection &&
      !connection.lastHealthyAt &&
      (connection.state === "connecting" ||
        connection.state === "importing" ||
        connection.state === "catchingUp"),
  );

/**
 * The first-ever import exhausted retries or stalled into delayed/ATTENTION
 * before the connection was ever healthy. Distinct from an established
 * account's delayed catch-up (which has lastHealthyAt).
 */
export const isFirstImportFailed = (
  connection?: GoogleSyncConnectionSummary | null,
): boolean =>
  Boolean(
    connection &&
      !connection.lastHealthyAt &&
      (connection.state === "delayed" ||
        connection.connectionState === "ATTENTION"),
  );

export type CalendarConnectionBannerKind =
  | "reconnect"
  | "consentRequired"
  | "importFailed"
  | "delayed";

// Persistent in-calendar banner. Reconnect wins, then a failed first import,
// then an established account's delayed catch-up. First-import-in-progress
// stays on the grid overlay, not this banner.
export const getCalendarConnectionBannerKind = (
  state: GoogleUiState,
  connection?: GoogleSyncConnectionSummary | null,
): CalendarConnectionBannerKind | null => {
  if (connectionNeedsAdminConsent(connection)) return "consentRequired";
  if (connectionNeedsReconnect(state, connection)) return "reconnect";
  if (isFirstImportFailed(connection)) return "importFailed";
  if (state === "ATTENTION" || connection?.state === "delayed") {
    return "delayed";
  }
  return null;
};

/**
 * The sidebar's take on one account's status. Two rules the sidebar applies
 * that Settings doesn't: a connect/reconnect that has been clicked but hasn't
 * round-tripped yet wins over the (still pre-click) connection summary, and a
 * healthy account shows nothing at all - the sidebar stays quiet, full detail
 * lives in Settings.
 */
export const getSidebarSyncStatus = ({
  connection,
  isConnecting,
  state,
  nowMs = Date.now(),
  refreshGaveUp = false,
  refreshInFlight = false,
}: {
  connection?: GoogleSyncConnectionSummary | null;
  isConnecting: boolean;
  state: GoogleUiState;
  nowMs?: number;
  refreshGaveUp?: boolean;
  refreshInFlight?: boolean;
}): SyncStatus => {
  if (isConnecting) {
    return {
      variant: "syncing",
      text: connectionNeedsReconnect(state, connection)
        ? "Reconnecting your calendar…"
        : "Connecting your calendar…",
    };
  }

  if (connectionNeedsAdminConsent(connection)) {
    return CONSENT_REQUIRED_STATUS;
  }

  if (connectionNeedsReconnect(state, connection)) {
    return reconnectStatusFor(connection?.accountEmail);
  }

  if (
    refreshGaveUp &&
    (state === "ATTENTION" || connection?.state === "delayed")
  ) {
    return { variant: "error", text: "Calendar updates are delayed" };
  }

  // Align with the Syncing… status while we wait for delayed to clear —
  // otherwise the bar keeps saying updates are delayed beside a hopeful button.
  if (
    refreshInFlight &&
    (state === "ATTENTION" || connection?.state === "delayed")
  ) {
    return { variant: "syncing", text: "Syncing in the background…" };
  }

  if (connection) {
    switch (connection.state) {
      case "catchingUp": {
        if (!connection.lastHealthyAt) {
          return { variant: "syncing", text: "Adding your calendar…" };
        }
        const ageMs = syncedAgeMs(connection.lastSyncedAt, nowMs);
        if (ageMs !== null && ageMs >= CATCHING_UP_NOTICE_AFTER_MS) {
          return { variant: "syncing", text: "Syncing in the background…" };
        }
        return null;
      }
      case "delayed":
        return {
          variant: "warning",
          text:
            connection.stateReason === "providerErrors"
              ? "Couldn't update your calendar"
              : "Calendar updates are delayed",
        };
      case "actionRequired":
      case "disconnected":
        return reconnectStatusFor(connection.accountEmail);
      case "connecting":
      case "importing":
        return connection.lastHealthyAt
          ? null
          : { variant: "syncing", text: "Adding your calendar…" };
      case "healthy":
        return null;
    }
  }

  const status = getGoogleSyncStatus(state, connection, nowMs, {
    refreshGaveUp,
  });
  return status?.variant === "healthy" ? null : status;
};
