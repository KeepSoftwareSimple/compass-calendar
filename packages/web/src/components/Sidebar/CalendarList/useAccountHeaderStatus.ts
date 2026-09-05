import { type SyncConnectionSummary } from "@core/types/user.types";
import { getSidebarSyncStatus } from "@web/auth/google/hooks/useConnectGoogle/useConnectGoogle.util";
import { connectionProvider } from "@web/auth/providers/provider-copy.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";

/**
 * Shared by AccountSectionHeader and CalendarListHeader: this account's sync
 * status plus the label for its connect/reconnect/refresh action, if any.
 */
export function useAccountHeaderStatus(
  connection: SyncConnectionSummary | null | undefined,
) {
  const { commandAction, isAvailable, isConnecting, isRefreshing, state } =
    useConnectProvider(connectionProvider(connection), { connection });
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
  };
}
