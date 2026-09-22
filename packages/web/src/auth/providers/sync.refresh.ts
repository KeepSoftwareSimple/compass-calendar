import { useSyncExternalStore } from "react";
import { type ConnectionRefreshResponse } from "@core/types/sync/connection.contracts";
import { AuthApi } from "@web/api/auth.api";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";

type Listener = () => void;

export type GoogleSyncRefreshSnapshot = {
  // True from the moment Refresh is requested until the connection leaves a
  // degraded state, or the catch-up timeout fires. Covers the HTTP round trip
  // AND the wait for real sync progress (the 2026-08-07 incident showed the
  // label reverting as soon as the POST returned while jobs sat pending).
  isRefreshing: boolean;
  refreshRequestedAt: number | null;
  // Refresh was requested and the degraded state did not improve before the
  // timeout — stop offering the same inert Refresh CTA.
  gaveUp: boolean;
};

export type GoogleSyncRefreshCoordinatorOptions = {
  now?: () => number;
  timeoutMs?: number;
  schedule?: (
    callback: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  cancel?: (handle: ReturnType<typeof setTimeout>) => void;
};

// How long "Catching up…" waits for metadata to leave delayed/ATTENTION before
// we admit the refresh did not help. setTimeout (not rAF) so a hidden preview
// tab still fires.
export const GOOGLE_SYNC_REFRESH_CATCHUP_MS = 3 * 60_000;

const IDLE_SNAPSHOT: GoogleSyncRefreshSnapshot = {
  isRefreshing: false,
  refreshRequestedAt: null,
  gaveUp: false,
};

// One browser-wide refresh owns the enqueue request and metadata recheck. This
// prevents the sidebar, delayed toast, and focus hook from racing each other
// while still letting every caller react to the same success or failure.
export const createGoogleSyncRefreshCoordinator = (
  requestRefresh: () => Promise<ConnectionRefreshResponse>,
  options: GoogleSyncRefreshCoordinatorOptions = {},
) => {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? GOOGLE_SYNC_REFRESH_CATCHUP_MS;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;

  const listeners = new Set<Listener>();
  let inFlight: Promise<ConnectionRefreshResponse> | null = null;
  let snapshot = IDLE_SNAPSHOT;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  const setSnapshot = (next: GoogleSyncRefreshSnapshot) => {
    snapshot = next;
    emit();
  };

  const clearTimeoutHandle = () => {
    if (timeoutHandle !== null) {
      cancel(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const armCatchupTimeout = (requestedAt: number) => {
    clearTimeoutHandle();
    timeoutHandle = schedule(() => {
      timeoutHandle = null;
      if (snapshot.refreshRequestedAt !== requestedAt) return;
      setSnapshot({
        isRefreshing: false,
        refreshRequestedAt: requestedAt,
        gaveUp: true,
      });
    }, timeoutMs);
  };

  const refresh = (): Promise<ConnectionRefreshResponse> => {
    if (inFlight) return inFlight;

    const requestedAt = now();
    const request = requestRefresh();
    inFlight = request;
    setSnapshot({
      isRefreshing: true,
      refreshRequestedAt: requestedAt,
      gaveUp: false,
    });

    void request.then(
      () => {
        if (inFlight !== request) return;
        inFlight = null;
        // Stay in isRefreshing until metadata improves or the timeout fires.
        // Snapshot already reflects that wait — no extra emit needed.
        armCatchupTimeout(requestedAt);
      },
      () => {
        if (inFlight !== request) return;
        inFlight = null;
        clearTimeoutHandle();
        setSnapshot(IDLE_SNAPSHOT);
      },
    );
    return request;
  };

  // SSE-driven metadata refresh calls this when the connection leaves the
  // delayed / ATTENTION band that showed the Refresh CTA.
  const noteConnectionImproved = () => {
    if (!snapshot.refreshRequestedAt && !snapshot.gaveUp) return;
    clearTimeoutHandle();
    inFlight = null;
    setSnapshot(IDLE_SNAPSHOT);
  };

  return {
    refresh,
    noteConnectionImproved,
    getSnapshot: (): GoogleSyncRefreshSnapshot => snapshot,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const coordinator = createGoogleSyncRefreshCoordinator(async () => {
  const result = await AuthApi.refreshConnections();
  await refreshUserMetadata({ force: true });
  return result;
});

export const refreshGoogleSync = () => coordinator.refresh();

export const noteGoogleSyncRefreshImproved = () =>
  coordinator.noteConnectionImproved();

export const useGoogleSyncRefreshSnapshot = () =>
  useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );
