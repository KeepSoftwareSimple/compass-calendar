import { useCallback, useEffect } from "react";
import { type Id } from "react-toastify";
import {
  type ImportResultMessage,
  type SyncStatusMessage,
  type UserMetadataMessage,
} from "@core/types/server-message.contracts";
import { type UserMetadata } from "@core/types/user.types";
import { type ConnectionRevokedContext } from "@web/auth/providers/connection-revoked.util.factory";
import {
  clearGoogleSyncIndicatorOverride,
  clearSyncingSyncIndicatorOverride,
  getGoogleSyncIndicatorOverride,
  setSyncingSyncIndicatorOverride,
} from "@web/auth/providers/sync.indicator.state";
import { findSyncConnectionsFromMetadata } from "@web/auth/state/user-metadata.store";
import { GOOGLE_REPAIR_FAILED_TOAST_ID } from "@web/common/constants/toast.constants";
import { type OnServerMessage } from "@web/sse/client/sse.client";
import { hasTransientSyncConnection } from "@web/sse/hooks/transient-sync-states";

export type SyncSSEDependencies = {
  handleConnectionRevoked: (context?: ConnectionRevokedContext) => void;
  invalidateEventQueries: () => void;
  onServerMessage: OnServerMessage;
  refreshUserMetadata: (options?: {
    force?: boolean;
  }) => Promise<unknown> | unknown;
  setUserMetadata: (metadata: UserMetadata) => void;
  showErrorToast: (
    message: string | undefined,
    options: { toastId: Id },
  ) => void;
};

const revokedConnectionId = (message: SyncStatusMessage): string | undefined =>
  message.sync.status === "attention" ? message.sync.connectionId : undefined;

export const createUseSyncSSE = (dependencies: SyncSSEDependencies) => {
  return function useSyncSSEWithDependencies() {
    // B10 folds import start/progress/end into syncStatusChanged
    // (syncing/healthy/attention) plus a separate importCompleted summary.
    // Do not clear the syncing override from a healthy/importCompleted SSE
    // alone — only metadata that leaves IMPORTING may end the loading UI
    // (S41: no healthy-from-local-optimism).
    const onSyncStatusChanged = useCallback((message: SyncStatusMessage) => {
      if (message.sync.status === "syncing") {
        if (getGoogleSyncIndicatorOverride() !== null) return;
        setSyncingSyncIndicatorOverride();
        return;
      }

      if (message.sync.status === "healthy") {
        void dependencies.refreshUserMetadata({ force: true });
        return;
      }

      // attention
      clearGoogleSyncIndicatorOverride();

      if (message.sync.code === "CONNECTION_REVOKED") {
        dependencies.handleConnectionRevoked({
          connectionId: revokedConnectionId(message),
        });
        return;
      }

      void dependencies.refreshUserMetadata({ force: true });

      if (message.sync.code === "WATCH_REPAIR_FAILED") {
        dependencies.showErrorToast(
          "We couldn't keep your calendar connection healthy. Try Refresh, or reconnect if this lasts.",
          {
            toastId: GOOGLE_REPAIR_FAILED_TOAST_ID,
          },
        );
      }
    }, []);

    const onImportCompleted = useCallback((_message: ImportResultMessage) => {
      void dependencies.refreshUserMetadata({ force: true });
      dependencies.invalidateEventQueries();
    }, []);

    // Sync connection/calendar invalidations arrive as calendarsChanged. Refetch
    // metadata so IMPORTING → HEALTHY (or RECONNECT/ATTENTION) reaches the UI.
    const onCalendarsChanged = useCallback(() => {
      void dependencies.refreshUserMetadata({ force: true });
    }, []);

    const onUserMetadataChanged = useCallback(
      (message: UserMetadataMessage) => {
        // The backend replays the whole user-metadata payload here (packet-01
        // contract note); the web-side UserMetadata shape is still a plain
        // interface with no schema of its own to validate against.
        const metadata = message.metadata as UserMetadata;
        dependencies.setUserMetadata(metadata);

        // Prefer Sync's in-progress states when present; otherwise the collapsed
        // product enum. Never clear syncing from local optimism alone (S41).
        const connections = findSyncConnectionsFromMetadata(metadata);
        const syncInProgress = hasTransientSyncConnection(connections);
        const importing = connections.some(
          (connection) => connection.connectionState === "IMPORTING",
        );
        if (!syncInProgress && !importing) {
          clearSyncingSyncIndicatorOverride();
        }
      },
      [],
    );

    useEffect(() => {
      const unsubscribeSyncStatus = dependencies.onServerMessage(
        "syncStatusChanged",
        onSyncStatusChanged,
      );
      const unsubscribeImportCompleted = dependencies.onServerMessage(
        "importCompleted",
        onImportCompleted,
      );
      const unsubscribeCalendars = dependencies.onServerMessage(
        "calendarsChanged",
        onCalendarsChanged,
      );
      const unsubscribeUserMetadata = dependencies.onServerMessage(
        "userMetadataChanged",
        onUserMetadataChanged,
      );

      return () => {
        unsubscribeSyncStatus();
        unsubscribeImportCompleted();
        unsubscribeCalendars();
        unsubscribeUserMetadata();
      };
    }, [
      onSyncStatusChanged,
      onImportCompleted,
      onCalendarsChanged,
      onUserMetadataChanged,
    ]);
  };
};
