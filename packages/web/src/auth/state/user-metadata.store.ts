import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  type GoogleConnectionState,
  type GoogleSyncConnectionSummary,
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
        const filter = (connection: SyncConnectionSummary) =>
          connection.id !== connectionId;
        const nextConnections = (
          state.current.connections ??
          state.current.google?.connections ??
          []
        ).filter(filter);
        return {
          current: {
            ...state.current,
            connections: nextConnections,
            google: state.current.google
              ? {
                  ...state.current.google,
                  connections: (state.current.google.connections ?? []).filter(
                    filter,
                  ),
                }
              : state.current.google,
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
 * Selects the unified Google connection state computed by the server.
 * Returns "NOT_CONNECTED" if metadata hasn't loaded yet.
 */
export const selectGoogleConnectionState = (
  state: UserMetadataState,
): GoogleConnectionState =>
  state.current?.google?.connectionState ?? "NOT_CONNECTED";

// Stable identity so the selector below never hands the store a fresh array
// (which would re-render on every state change; see the note above the hook).
const NO_CONNECTIONS: GoogleSyncConnectionSummary[] = [];

/**
 * Every connected provider account, in connection order. Empty when metadata
 * hasn't loaded or no account is connected. Prefers the WP-07
 * `connections[]` field and falls back to the Google overlap copy.
 */
export const selectSyncConnections = (
  state: UserMetadataState,
): SyncConnectionSummary[] =>
  state.current?.connections ??
  state.current?.google?.connections ??
  NO_CONNECTIONS;

/**
 * Google-only slice. Prefer {@link selectSyncConnections} for surfaces that
 * render any provider.
 */
export const selectGoogleSyncConnections = (
  state: UserMetadataState,
): GoogleSyncConnectionSummary[] =>
  state.current?.google?.connections ?? NO_CONNECTIONS;

/**
 * True when ANY connected account granted the optional contacts scopes, so
 * the attendee field can query live suggestions (the backend proxy fans out
 * across every capable connection). `=== true` keeps a payload from an older
 * backend (field absent) reading as "not granted" rather than crashing.
 */
export const selectCanSuggestContacts = (state: UserMetadataState): boolean =>
  (state.current?.google?.connections ?? NO_CONNECTIONS).some(
    (connection) => connection.canSuggestContacts === true,
  );

/**
 * The connection whose own state matches the aggregate `connectionState` -
 * the account most responsible for it, so an unscoped reconnect targets the
 * broken one, not a healthy sibling. Falls back to the first connection when
 * none match (shouldn't happen: the aggregate is itself derived by the same
 * precedence over these same connections - defensive only).
 *
 * Mirrors the sync service's own selectPrimaryGoogleConnection: the server
 * used to compute this and send it as a second `google.connection` field,
 * which was exactly this array's own connectionState re-derived - the browser
 * has everything it needs to compute it locally instead.
 */
function findPrimarySyncConnection(
  metadata: UserMetadata | null | undefined,
): SyncConnectionSummary | null {
  const connections =
    metadata?.connections ?? metadata?.google?.connections ?? NO_CONNECTIONS;
  if (connections.length === 0) return null;
  return (
    connections.find(
      (connection) =>
        connection.connectionState === metadata?.google?.connectionState,
    ) ??
    connections[0] ??
    null
  );
}

function findPrimaryGoogleSyncConnection(
  google: UserMetadata["google"],
): GoogleSyncConnectionSummary | null {
  const connections = google?.connections ?? NO_CONNECTIONS;
  if (connections.length === 0) return null;
  return (
    connections.find((c) => c.connectionState === google?.connectionState) ??
    connections[0] ??
    null
  );
}

/** Store-selector form of {@link findPrimarySyncConnection}. */
export const selectPrimarySyncConnection = (
  state: UserMetadataState,
): SyncConnectionSummary | null => findPrimarySyncConnection(state.current);

/** Store-selector form of {@link findPrimaryGoogleSyncConnection}. */
export const selectPrimaryGoogleSyncConnection = (
  state: UserMetadataState,
): GoogleSyncConnectionSummary | null =>
  findPrimaryGoogleSyncConnection(state.current?.google);

/**
 * Same selection, for a raw `UserMetadata` payload that hasn't gone through
 * the store yet (an SSE `userMetadataChanged` message) - see
 * useGcalSSE.factory.ts.
 */
export const findPrimaryGoogleSyncConnectionFromMetadata = (
  metadata: UserMetadata,
): GoogleSyncConnectionSummary | null =>
  findPrimaryGoogleSyncConnection(metadata.google);
