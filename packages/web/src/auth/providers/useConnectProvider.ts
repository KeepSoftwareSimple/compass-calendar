import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ConnectionId,
  type ProviderKind,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { AuthApi } from "@web/api/auth.api";
import {
  type UseConnectGoogleOptions,
  type UseConnectGoogleResult,
} from "@web/auth/providers/connect.types";
import {
  connectionHasReconnectRequired,
  getGoogleConnectionConfig,
} from "@web/auth/providers/connect.util";
import { connectAppleActions } from "@web/auth/providers/connect-apple.store";
import { usesCredentialFormConnect } from "@web/auth/providers/provider-connect-flow.util";
import {
  connectionProvider,
  relabelConnectCommand,
} from "@web/auth/providers/provider-copy.util";
import {
  noteGoogleSyncRefreshImproved,
  refreshGoogleSync,
  useGoogleSyncRefreshSnapshot,
} from "@web/auth/providers/sync.refresh";
import { useIsProviderAvailable } from "@web/auth/providers/useIsProviderAvailable";
import { useGoogleUiState } from "@web/auth/providers/useProviderUiState";
import { finishCredentialConnect } from "@web/auth/providers/useSubmitAppleCredential";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import {
  GOOGLE_CONNECT_FAILED_TOAST_ID,
  GOOGLE_REFRESH_ALREADY_IN_FLIGHT_TOAST_ID,
  GOOGLE_REFRESH_FAILED_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { getToast } from "@web/common/utils/toast/toast.port";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { settingsActions } from "@web/settings/settings.store";

export type UseConnectProviderOptions = UseConnectGoogleOptions;
export type { UseConnectGoogleOptions, UseConnectGoogleResult };

export const useConnectGoogle = (
  options?: UseConnectGoogleOptions,
): UseConnectGoogleResult => useConnectProvider("google", options);

export const useConnectProvider = (
  kind: ProviderKind,
  options?: UseConnectProviderOptions,
): UseConnectGoogleResult => {
  const isAvailable = useIsProviderAvailable(kind, "connect");
  const aggregateState = useGoogleUiState();
  const connections = useUserMetadataStore(selectSyncConnections);
  const kindPrimary =
    connections.find(
      (connection) =>
        connectionProvider(connection) === kind &&
        connection.connectionState === aggregateState,
    ) ??
    connections.find((connection) => connectionProvider(connection) === kind) ??
    null;
  const scopedConnection = options?.connection;
  const syncConnection = scopedConnection ?? kindPrimary;
  const state =
    scopedConnection != null && connectionHasReconnectRequired(scopedConnection)
      ? "RECONNECT_REQUIRED"
      : (scopedConnection?.connectionState ?? aggregateState);
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const isConnectingRef = useRef(false);
  const refreshSnapshot = useGoogleSyncRefreshSnapshot();
  const isRefreshing = refreshSnapshot.isRefreshing;
  const stopConnecting = useCallback(() => {
    isConnectingRef.current = false;
    setIsConnecting(false);
  }, []);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        stopConnecting();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [stopConnecting]);

  useEffect(() => {
    if (!refreshSnapshot.refreshRequestedAt && !refreshSnapshot.gaveUp) {
      return;
    }
    const connectionState = syncConnection?.state;
    if (
      connectionState &&
      connectionState !== "delayed" &&
      state !== "ATTENTION"
    ) {
      noteGoogleSyncRefreshImproved();
    }
  }, [
    refreshSnapshot.gaveUp,
    refreshSnapshot.refreshRequestedAt,
    state,
    syncConnection?.state,
  ]);

  const onOpenAuth = useCallback(() => {
    if (isConnectingRef.current) {
      return;
    }

    settingsActions.closeCmdPalette();

    if (usesCredentialFormConnect(kind)) {
      const prefillEmail =
        syncConnection?.stateReason === "authorizationExpired"
          ? (syncConnection.accountEmail ?? "")
          : "";
      connectAppleActions.open(prefillEmail);
      return;
    }

    isConnectingRef.current = true;
    setIsConnecting(true);

    const start = async () => {
      try {
        const beginRequest = {
          ...(options?.newAccount ||
          !(state === "RECONNECT_REQUIRED" && syncConnection?.id)
            ? {}
            : { connectionId: syncConnection.id as ConnectionId }),
          ...(options?.features !== undefined
            ? { features: options.features }
            : {}),
          provider: kind,
        };
        const result = await AuthApi.beginConnection(beginRequest);
        if ("authorizationUrl" in result) {
          window.location.assign(result.authorizationUrl);
          return;
        }
        if (result.kind === "connected") {
          finishCredentialConnect(kind);
          void queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
        }
        stopConnecting();
      } catch {
        stopConnecting();
        showErrorToast(
          `We couldn't start connecting your ${providerDisplayName(kind)} Calendar. Please try again.`,
          { toastId: GOOGLE_CONNECT_FAILED_TOAST_ID },
        );
      }
    };

    void start();
  }, [
    kind,
    options?.features,
    options?.newAccount,
    queryClient,
    state,
    stopConnecting,
    syncConnection?.accountEmail,
    syncConnection?.id,
    syncConnection?.stateReason,
  ]);

  const onRefresh = useCallback(
    (refreshOptions?: { silent?: boolean }) => {
      if (isConnectingRef.current || refreshSnapshot.isRefreshing) {
        return;
      }

      if (!refreshOptions?.silent) {
        settingsActions.closeCmdPalette();
      }

      void refreshGoogleSync()
        .then((result) => {
          void queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
          if (
            !refreshOptions?.silent &&
            result.inFlight > 0 &&
            result.enqueued === 0
          ) {
            getToast().info("Already refreshing your calendars", {
              toastId: GOOGLE_REFRESH_ALREADY_IN_FLIGHT_TOAST_ID,
            });
          }
        })
        .catch(() => {
          if (!refreshOptions?.silent) {
            showErrorToast(
              "We couldn't refresh your calendar. Please try again in a moment.",
              { toastId: GOOGLE_REFRESH_FAILED_TOAST_ID },
            );
          }
        });
    },
    [queryClient, refreshSnapshot.isRefreshing],
  );

  const googleConfig = getGoogleConnectionConfig(
    state,
    {
      onConnectGoogle: onOpenAuth,
      onRefreshGoogle: onRefresh,
    },
    {
      refreshGaveUp: refreshSnapshot.gaveUp,
      provider: kind,
    },
  );

  return {
    ...googleConfig,
    commandAction: relabelConnectCommand(googleConfig.commandAction, kind),
    connect: onOpenAuth,
    connection: syncConnection,
    refresh: onRefresh,
    isAvailable,
    isConnecting,
    isRefreshing,
    state,
  };
};
