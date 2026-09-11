import { Status } from "@core/errors/status.codes";
import { type UserMetadata } from "@core/types/user.types";
import { UserApi } from "@web/api/user.api";
import { connectionHasReconnectRequired } from "@web/auth/providers/connect.util";
import { syncReconnectRequiredFromConnections } from "@web/auth/providers/reconnect.state";
import {
  findSyncConnectionsFromMetadata,
  userMetadataActions,
} from "@web/auth/state/user-metadata.store";
import {
  dismissGoogleDelayedToast,
  showGoogleDelayedToast,
} from "@web/common/utils/toast/google-delayed.toast";
import {
  clearGoogleReconnectToastGate,
  dismissGoogleReconnectToast,
  dismissGoogleReconnectToastIfRecovered,
} from "@web/common/utils/toast/google-reconnect.toast";

let refreshUserMetadataRequest: Promise<void> | null = null;
let hasShownDelayedToastThisLoad = false;
let metadataFetchEpoch = 0;

/**
 * Keep session reconnect overrides and delayed toasts congruent with the latest
 * metadata payload, whether it arrived from REST refresh or SSE.
 *
 * Reconnect toasts are not raised here: week/day already have the banner and
 * per-account sidebar CTA. The named toast is the interrupt for a live 410 /
 * failed write (`handleConnectionRevoked`).
 */
export const applyUserMetadataSideEffects = (metadata: UserMetadata): void => {
  const connections = findSyncConnectionsFromMetadata(metadata);
  syncReconnectRequiredFromConnections(connections);

  const stillBroken = connections.some((connection) =>
    connectionHasReconnectRequired(connection),
  );
  if (stillBroken) {
    dismissGoogleReconnectToastIfRecovered(connections);
  } else {
    dismissGoogleReconnectToast();
    clearGoogleReconnectToastGate();
  }

  if (metadata.google?.connectionState === "ATTENTION") {
    if (!hasShownDelayedToastThisLoad) {
      hasShownDelayedToastThisLoad = true;
      showGoogleDelayedToast();
    }
  } else if (hasShownDelayedToastThisLoad) {
    // Recovered: a CRITICAL toast (autoClose: false) never closes on its
    // own, so leaving it up would contradict its own "delayed" copy once
    // the connection is healthy again.
    hasShownDelayedToastThisLoad = false;
    dismissGoogleDelayedToast();
  }
};

export const refreshUserMetadata = async (options?: {
  force?: boolean;
}): Promise<void> => {
  if (refreshUserMetadataRequest) {
    if (!options?.force) {
      return refreshUserMetadataRequest;
    }

    // Concurrent force calls chain onto one trailing fetch: each waits for
    // the in-flight request, then `refreshUserMetadata()` without force joins
    // whichever fetch the first waiter already started. A burst of SSE
    // signals cannot stampede.
    return refreshUserMetadataRequest.then(() => refreshUserMetadata());
  }

  userMetadataActions.setLoading();
  const epoch = ++metadataFetchEpoch;

  refreshUserMetadataRequest = UserApi.getMetadata()
    .then((metadata) => {
      if (epoch !== metadataFetchEpoch) return;
      userMetadataActions.set(metadata);
      applyUserMetadataSideEffects(metadata);
    })
    .catch((error) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      const isUnauthorized =
        status === Status.UNAUTHORIZED || status === Status.FORBIDDEN;

      if (isUnauthorized) {
        userMetadataActions.clear();
        return;
      }

      console.error("Failed to refresh user metadata", error);
      userMetadataActions.finishLoading();
    })
    .finally(() => {
      refreshUserMetadataRequest = null;
    });

  return refreshUserMetadataRequest;
};
