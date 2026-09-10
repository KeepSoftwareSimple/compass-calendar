import { type SyncConnectionSummary } from "@core/types/user.types";

export function fallbackReconnectConnection(id: string): SyncConnectionSummary {
  return {
    id,
    provider: "google",
    state: "actionRequired",
    stateReason: null,
    lastSyncedAt: null,
    lastHealthyAt: null,
    accountEmail: null,
    connectionState: "RECONNECT_REQUIRED",
    canSuggestContacts: false,
  };
}

export function reconnectRequiredConnections(
  connections: readonly SyncConnectionSummary[],
): SyncConnectionSummary[] {
  return connections.filter(
    (connection) => connection.connectionState === "RECONNECT_REQUIRED",
  );
}

export function reconnectActionTargets(
  connections: readonly SyncConnectionSummary[],
  fallbackId: string,
): SyncConnectionSummary[] {
  const reconnecting = reconnectRequiredConnections(connections);
  return reconnecting.length > 0
    ? reconnecting
    : [fallbackReconnectConnection(fallbackId)];
}
