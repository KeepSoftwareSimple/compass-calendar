import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
  type UserMetadata,
} from "@core/types/user.types";
import { IS_DEV } from "@web/common/constants/env.constants";

export type UserMetadataStatus = "idle" | "loading" | "loaded";

export interface UserMetadataState {
  current: UserMetadata | null;
  status: UserMetadataStatus;
}

export const initialUserMetadataState: UserMetadataState = {
  current: null,
  status: "idle",
};

const GOOGLE_CONNECTION_STATE_PRECEDENCE: readonly GoogleConnectionState[] = [
  "RECONNECT_REQUIRED",
  "ATTENTION",
  "IMPORTING",
  "HEALTHY",
];

const googleConnectionsFrom = (
  connections: readonly SyncConnectionSummary[],
): SyncConnectionSummary[] =>
  connections.filter((connection) => connection.provider === "google");

export const aggregateGoogleConnectionState = (
  connections: readonly SyncConnectionSummary[],
): GoogleConnectionState => {
  const googleConnections = googleConnectionsFrom(connections);
  if (googleConnections.length === 0) return "NOT_CONNECTED";

  const states = googleConnections.map(
    (connection) => connection.connectionState,
  );
  for (const candidate of GOOGLE_CONNECTION_STATE_PRECEDENCE) {
    if (states.includes(candidate)) return candidate;
  }
  return "NOT_CONNECTED";
};

// Selectors passed to this hook must return primitives or stable references;
// a selector that builds a new object/array each call needs `useShallow`.
export const useUserMetadataStore = create<UserMetadataState>()(
  devtools(() => initialUserMetadataState, {
    name: "compass/userMetadata",
    enabled: IS_DEV,
  }),
);

export const userMetadataActions = {
  setLoading: () =>
    useUserMetadataStore.setState({ status: "loading" }, false, {
      type: "setLoading",
    }),
  finishLoading: () =>
    useUserMetadataStore.setState(
      (state) => ({ status: state.current ? "loaded" : "idle" }),
      false,
      { type: "finishLoading" },
    ),
  set: (metadata: UserMetadata) =>
    useUserMetadataStore.setState(
      { current: metadata, status: "loaded" },
      false,
      { type: "set" },
    ),
  clear: () =>
    useUserMetadataStore.setState(initialUserMetadataState, true, {
      type: "clear",
    }),
  // Optimistically drops one connection right after a successful disconnect,
  // so the Accounts panel doesn't wait on the next metadata fetch - which can
  // still return the just-removed connection if it races backend cleanup.
  removeConnection: (connectionId: string) =>
    useUserMetadataStore.setState(
      (state) => {
        if (!state.current) return state;
        const nextConnections = (state.current.connections ?? []).filter(
          (connection) => connection.id !== connectionId,
        );
        if (nextConnections === state.current.connections) {
          return state;
        }
        return {
          current: {
            ...state.current,
            connections: nextConnections,
          },
        };
      },
      false,
      { type: "removeConnection" },
    ),
};

// Expose a semantic bridge for e2e tests (see e2e/utils/compass-window.ts).
// Tests drive connection-status scenarios by setting metadata directly.
if (typeof window !== "undefined") {
  window.__COMPASS_E2E_STORE__ = {
    ...window.__COMPASS_E2E_STORE__,
    userMetadata: {
      getState: useUserMetadataStore.getState,
      set: userMetadataActions.set,
      setLoading: userMetadataActions.setLoading,
      clear: userMetadataActions.clear,
    },
  };
}

export const selectUserMetadataStatus = (state: UserMetadataState) =>
  state.status;

/**
 * Selects the unified Google connection state derived from connected accounts.
 * Returns "NOT_CONNECTED" if metadata hasn't loaded yet.
 */
export const selectGoogleConnectionState = (
  state: UserMetadataState,
): GoogleConnectionState =>
  state.current
    ? aggregateGoogleConnectionState(
        findSyncConnectionsFromMetadata(state.current),
      )
    : "NOT_CONNECTED";

// Stable identity so the selector below never hands the store a fresh array
// (which would re-render on every state change; see the note above the hook).
const NO_CONNECTIONS: SyncConnectionSummary[] = [];

/**
 * Every connected provider account, in connection order. Empty when metadata
 * hasn't loaded or no account is connected.
 */
export const selectSyncConnections = (
  state: UserMetadataState,
): SyncConnectionSummary[] => state.current?.connections ?? NO_CONNECTIONS;

/** @deprecated Prefer {@link selectSyncConnections}. */
export const selectGoogleSyncConnections = (
  state: UserMetadataState,
): SyncConnectionSummary[] => selectSyncConnections(state);

/**
 * True when ANY connected account granted the optional contacts scopes, so
 * the attendee field can query live suggestions (the backend proxy fans out
 * across every capable connection). `=== true` keeps a payload from an older
 * backend (field absent) reading as "not granted" rather than crashing.
 */
export const selectCanSuggestContacts = (state: UserMetadataState): boolean =>
  selectSyncConnections(state).some(
    (connection) => connection.canSuggestContacts === true,
  );

function findPrimaryGoogleSyncConnection(
  connections: readonly SyncConnectionSummary[],
): SyncConnectionSummary | null {
  const googleConnections = googleConnectionsFrom(connections);
  if (googleConnections.length === 0) return null;
  const aggregate = aggregateGoogleConnectionState(connections);
  return (
    googleConnections.find(
      (connection) => connection.connectionState === aggregate,
    ) ??
    googleConnections[0] ??
    null
  );
}

/** Store-selector form of {@link findPrimaryGoogleSyncConnection}. */
export const selectPrimaryGoogleSyncConnection = (
  state: UserMetadataState,
): SyncConnectionSummary | null =>
  findPrimaryGoogleSyncConnection(
    findSyncConnectionsFromMetadata(state.current ?? {}),
  );

/**
 * Every connection on a raw metadata payload (SSE `userMetadataChanged`).
 */
export const findSyncConnectionsFromMetadata = (
  metadata: UserMetadata,
): SyncConnectionSummary[] => metadata.connections ?? NO_CONNECTIONS;

/**
 * Look up one connection by id on a raw payload. Without an id, falls back
 * to the aggregate primary — the same precedence as the store selector.
 */
export const findSyncConnectionFromMetadata = (
  metadata: UserMetadata,
  connectionId?: string | null,
): SyncConnectionSummary | null => {
  const connections = findSyncConnectionsFromMetadata(metadata);
  if (connectionId) {
    return (
      connections.find((connection) => connection.id === connectionId) ?? null
    );
  }
  return findPrimaryGoogleSyncConnection(connections);
};

/**
 * Same selection, for a raw `UserMetadata` payload that hasn't gone through
 * the store yet (an SSE `userMetadataChanged` message) - see
 * useSyncSSE.factory.ts.
 */
export const findPrimaryGoogleSyncConnectionFromMetadata = (
  metadata: UserMetadata,
): SyncConnectionSummary | null =>
  findPrimaryGoogleSyncConnection(findSyncConnectionsFromMetadata(metadata));
