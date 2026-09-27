import { useSyncExternalStore } from "react";
import { type GoogleConnectionState } from "@core/types/user.types";
import { hasUserEverAuthenticated } from "@web/auth/compass/state/auth.state.util";
import {
  hasGoogleReconnectRequired,
  useGoogleReconnectRequiredVersion,
} from "@web/auth/providers/reconnect.state";
import {
  getGoogleSyncIndicatorOverride,
  subscribeToGoogleSyncUIState,
} from "@web/auth/providers/sync.indicator.state";
import {
  selectGoogleConnectionState,
  selectUserMetadataStatus,
  type UserMetadataStatus,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { type GoogleUiState } from "./connect.types";

type SyncIndicator = ReturnType<typeof getGoogleSyncIndicatorOverride>;

export function resolveGoogleUiState({
  connectionState,
  hasAuthenticated,
  hasReconnectRequired = false,
  syncIndicator,
  userMetadataStatus,
}: {
  connectionState: GoogleConnectionState;
  hasAuthenticated: boolean;
  hasReconnectRequired?: boolean;
  syncIndicator: SyncIndicator;
  userMetadataStatus: UserMetadataStatus;
}): GoogleUiState {
  // Terminal reconnect-required must not be overwritten by a transient
  // "syncing" indicator or a lagging healthy metadata snapshot.
  if (connectionState === "RECONNECT_REQUIRED" || hasReconnectRequired) {
    return "RECONNECT_REQUIRED";
  }

  if (syncIndicator === "syncing") return "IMPORTING";

  if (hasAuthenticated && userMetadataStatus !== "loaded") {
    return "checking";
  }

  return connectionState;
}

// Merges server metadata with transient import overrides. The external
// store subscription keeps every sync indicator aligned as SSE updates arrive.
export function useGoogleUiState(): GoogleUiState {
  const connectionState = useUserMetadataStore(selectGoogleConnectionState);
  const userMetadataStatus = useUserMetadataStore(selectUserMetadataStatus);
  const syncIndicator = useSyncExternalStore(
    subscribeToGoogleSyncUIState,
    getGoogleSyncIndicatorOverride,
    getGoogleSyncIndicatorOverride,
  );
  useGoogleReconnectRequiredVersion();

  // Returning users should not briefly look disconnected while their server
  // metadata is still loading.
  return resolveGoogleUiState({
    connectionState,
    hasAuthenticated: hasUserEverAuthenticated(),
    hasReconnectRequired: hasGoogleReconnectRequired(),
    syncIndicator,
    userMetadataStatus,
  });
}
