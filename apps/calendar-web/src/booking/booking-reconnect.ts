import { type SyncConnectionSummary } from "@core/types/user.types";

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
  if (reconnecting.length > 0) {
    return reconnecting;
  }
  return [
    {
      id: fallbackId,
      provider: "google",
      state: "actionRequired",
      stateReason: null,
      lastSyncedAt: null,
      lastHealthyAt: null,
      accountEmail: null,
      connectionState: "RECONNECT_REQUIRED",
      canSuggestContacts: false,
    },
  ];
}
