import {
  type ConnectionState,
  type ConnectionStateReason,
  type ProviderConnection,
} from "@core/types/sync/connection.contracts";
import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";

/**
 * Translate the sync service's multi-connection health model into the single
 * `GoogleConnectionState` enum the browser already reads from
 * aggregate connection state derived from `connections[]`.
 *
 * The enum stays Google-specific during the overlap: only Google connections
 * collapse into it. Per-connection state lives on each summary. Keeping this
 * a pure function makes the mapping exhaustively testable in isolation.
 */

// actionRequired reasons that mean the user must re-authorize (re-run the
// connect flow), as opposed to waiting out a transient problem or contacting
// support. These map to RECONNECT_REQUIRED; other actionRequired reasons are
// surfaced as the softer ATTENTION.
const REAUTH_REASONS: ReadonlySet<ConnectionStateReason> = new Set([
  "authorizationRevoked",
  "authorizationExpired",
  "insufficientScopes",
]);

function translateConnection(
  state: ConnectionState,
  reason: ConnectionStateReason | null,
): GoogleConnectionState {
  switch (state) {
    case "healthy":
      return "HEALTHY";
    // Every "work in progress" state the UI shows as an importing spinner. The
    // legacy app likewise reports an active sync as IMPORTING, so catchingUp
    // (incremental backlog) is IMPORTING rather than HEALTHY.
    case "connecting":
    case "importing":
    case "catchingUp":
      return "IMPORTING";
    // A connection record exists but its credential is gone: the user must
    // reconnect. That is more actionable than NOT_CONNECTED, which the browser
    // treats as never-connected. Disconnected rows are filtered upstream in
    // google-connection-status.ts; this mapping is defensive only.
    case "disconnected":
      return "RECONNECT_REQUIRED";
    // actionRequired always needs the user to act. Re-auth reasons map to
    // RECONNECT_REQUIRED; any other reason falls to the softer ATTENTION.
    case "actionRequired":
      return reason && REAUTH_REASONS.has(reason)
        ? "RECONNECT_REQUIRED"
        : "ATTENTION";
    case "delayed":
      return "ATTENTION";
  }
}

// When a principal has more than one Google connection, surface the most
// actionable state so a single broken account is never hidden behind a healthy
// one. Microsoft and Apple connections do not participate in this enum.
const PRECEDENCE: readonly GoogleConnectionState[] = [
  "RECONNECT_REQUIRED",
  "ATTENTION",
  "IMPORTING",
  "HEALTHY",
];

export function toGoogleConnectionState(
  connections: readonly ProviderConnection[],
): GoogleConnectionState {
  const googleConnections = connections.filter(
    (connection) => connection.provider === "google",
  );
  if (googleConnections.length === 0) return "NOT_CONNECTED";

  const states = googleConnections.map((connection) =>
    translateConnection(connection.state, connection.stateReason),
  );
  for (const candidate of PRECEDENCE) {
    if (states.includes(candidate)) return candidate;
  }
  // Unreachable: translateConnection never returns NOT_CONNECTED, so a non-empty
  // list always matches a precedence value. Defensive only.
  return "NOT_CONNECTED";
}

export function toGoogleSyncConnectionSummary(
  connection: ProviderConnection,
): SyncConnectionSummary {
  return {
    id: connection.id,
    provider: connection.provider,
    state: connection.state,
    stateReason: connection.stateReason,
    lastSyncedAt: connection.lastSyncedAt,
    lastHealthyAt: connection.lastHealthyAt,
    accountEmail: connection.account.email,
    // This connection's own product state, so the browser can render one
    // account's status and reconnect without knowing sync's vocabulary. The
    // top-level `connectionState` stays the precedence winner across all
    // connections; this is deliberately per-connection and may differ.
    connectionState: translateConnection(
      connection.state,
      connection.stateReason,
    ),
    // Sync derives this capability from the OPTIONAL contacts scopes the
    // account actually granted; false is an ordinary state (the grant is
    // never required) that the browser uses to offer the enable-contacts
    // nudge instead of live suggestions.
    canSuggestContacts: connection.capabilities.includes("suggestContacts"),
  };
}
