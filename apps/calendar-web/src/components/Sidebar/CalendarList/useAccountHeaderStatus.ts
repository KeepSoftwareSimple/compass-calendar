import { type SyncConnectionSummary } from "@core/types/user.types";
import { getSidebarSyncStatus } from "@web/auth/providers/connect.util";
import { connectionProviderKind } from "@web/auth/providers/connection-provider.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";

/**
 * Shared by AccountSectionHeader and CalendarListHeader: this account's sync
 * status plus the label for its connect/reconnect/refresh action, if any.
 */
export function useAccountHeaderStatus(
  connection: SyncConnectionSummary | null | undefined,
) {
  const provider = connectionProviderKind(connection);
  const { commandAction, isAvailable, isConnecting, isRefreshing, state } =
    useConnectProvider(provider, { connection });
  const syncStatus = getSidebarSyncStatus({ connection, isConnecting, state });
  const actionLabel =
    commandAction == null
      ? null
      : isConnecting
        ? state === "RECONNECT_REQUIRED"
          ? "Reconnecting…"
          : "Connecting…"
        : isRefreshing
          ? "Catching up…"
          : commandAction.label;

  return {
    actionLabel,
    commandAction,
    isAvailable,
    isConnecting,
    isRefreshing,
    syncStatus,
    state,
  };
}
