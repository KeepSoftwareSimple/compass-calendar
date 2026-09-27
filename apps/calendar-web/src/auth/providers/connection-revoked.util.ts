import { type Calendar } from "@core/types/calendar.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { queryClient } from "@web/api/query-client";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import {
  calendarProviderKind,
  connectionProviderKind,
} from "@web/auth/providers/connection-provider.util";
import {
  type GoogleReconnectTarget,
  markAccountReconnectRequired,
} from "@web/auth/providers/reconnect.state";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { syncLocalEventsToCloud } from "@web/common/utils/sync/local-event-sync.util";
import { showGoogleReconnectToast } from "@web/common/utils/toast/google-reconnect.toast";
import { getToast } from "@web/common/utils/toast/toast.port";
import { closeStream, openStream } from "@web/sse/client/sse.client";
import {
  createGoogleAuthUtil,
  type GoogleRevokedContext,
} from "./connection-revoked.util.factory";

const toTarget = (
  connection: SyncConnectionSummary | undefined,
  fallback: GoogleReconnectTarget,
): GoogleReconnectTarget => ({
  connectionId: fallback.connectionId ?? connection?.id ?? null,
  accountEmail: fallback.accountEmail ?? connection?.accountEmail ?? null,
  provider: connection ? connectionProviderKind(connection) : fallback.provider,
});

const connectionMatchingEmail = (
  connections: readonly SyncConnectionSummary[],
  accountEmail: string,
  provider?: ReturnType<typeof connectionProviderKind> | null,
): SyncConnectionSummary | undefined => {
  const matches = connections.filter(
    (entry) => entry.accountEmail === accountEmail,
  );
  if (provider) {
    return matches.find((entry) => connectionProviderKind(entry) === provider);
  }
  return matches.length === 1 ? matches[0] : undefined;
};

/**
 * Resolve which account a revoke signal belongs to. Returns null when the
 * signal is ambiguous across multiple accounts — callers must not invent a
 * sticky override for a healthy sibling.
 */
const resolveRevokedAccount = (
  context?: GoogleRevokedContext,
): GoogleReconnectTarget | null => {
  const connections = selectSyncConnections(useUserMetadataStore.getState());

  if (context?.connectionId) {
    const connection = connections.find(
      (entry) => entry.id === context.connectionId,
    );
    return toTarget(connection, {
      connectionId: context.connectionId,
      accountEmail: context.accountEmail ?? connection?.accountEmail ?? null,
    });
  }

  if (context?.accountEmail) {
    const connection = connectionMatchingEmail(
      connections,
      context.accountEmail,
    );
    if (
      !connection &&
      connections.some((entry) => entry.accountEmail === context.accountEmail)
    ) {
      return null;
    }
    return toTarget(connection, {
      connectionId: connection?.id ?? null,
      accountEmail: context.accountEmail,
    });
  }

  if (context?.calendarId) {
    const calendars =
      queryClient.getQueryData<Calendar[]>(calendarQueryKeys.all) ?? [];
    const calendar = calendars.find((entry) => entry.id === context.calendarId);
    if (calendar?.accountEmail) {
      const provider = calendarProviderKind(calendar);
      const connection = connectionMatchingEmail(
        connections,
        calendar.accountEmail,
        provider,
      );
      return toTarget(connection, {
        connectionId: connection?.id ?? null,
        accountEmail: calendar.accountEmail,
        provider: provider ?? null,
      });
    }
  }

  const alreadyBroken = connections.find(
    (connection) => connection.connectionState === "RECONNECT_REQUIRED",
  );
  if (alreadyBroken) {
    return toTarget(alreadyBroken, {
      connectionId: alreadyBroken.id,
      accountEmail: alreadyBroken.accountEmail,
    });
  }

  if (connections.length === 1) {
    return toTarget(connections[0], {
      connectionId: connections[0]?.id ?? null,
      accountEmail: connections[0]?.accountEmail ?? null,
    });
  }

  // Multi-account with no identity: wait for metadata Sync actionRequired.
  return null;
};

const googleAuthUtil = createGoogleAuthUtil({
  closeStream,
  openStream,
  // Force a fresh fetch without wiping the store first — clearing would drop
  // the toast's live connection lookup mid-click and start an unscoped OAuth.
  refreshUserMetadata: () => {
    void refreshUserMetadata({ force: true });
  },
  resolveRevokedAccount,
  markAccountReconnectRequired,
  showReconnectToast: showGoogleReconnectToast,
  syncLocalEventsToCloud: () => syncLocalEventsToCloud(),
  toastError: (content, options) => getToast().error(content, options),
});

const {
  handleGoogleRevoked,
  showLocalEventsSyncFailure,
  syncLocalEvents,
  syncPendingLocalEvents,
} = googleAuthUtil;

export type {
  ConnectionRevokedContext,
  GoogleRevokedContext,
} from "./connection-revoked.util.factory";
export {
  handleGoogleRevoked as handleConnectionRevoked,
  handleGoogleRevoked,
  showLocalEventsSyncFailure,
  syncLocalEvents,
  syncPendingLocalEvents,
};
