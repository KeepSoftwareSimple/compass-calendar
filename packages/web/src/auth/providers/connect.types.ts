import { type Icon } from "@phosphor-icons/react/dist/lib/types";
import { type ConnectionBeginFeatures } from "@core/types/sync/connection.contracts";
import {
  type GoogleConnectionState,
  type GoogleSyncConnectionSummary,
} from "@core/types/user.types";

export type GoogleUiState = "checking" | GoogleConnectionState;

export type CommandActionIcon = Icon;

export type GoogleUiConfig = {
  commandAction: {
    label: string;
    icon: CommandActionIcon;
    onSelect: () => void;
  } | null;
};

export type UseConnectGoogleOptions = {
  /**
   * Scope the hook to one connected account: its own state drives the action
   * and status, and reconnect rebinds consent to that connection rather than
   * the precedence-winning one. Omit for the aggregate (whole-user) view.
   */
  connection?: GoogleSyncConnectionSummary | null;
  /**
   * Always start a new-account OAuth round-trip (`{}`), even when some other
   * account is `RECONNECT_REQUIRED`. Settings "Add account" must never bind
   * to a reconnect.
   */
  newAccount?: boolean;
  /**
   * Optional feature groups to add to the consent request (e.g.
   * `["contacts"]` for attendee suggestions). Each maps to OPTIONAL scopes
   * the user may decline while the connect flow still completes; omitted,
   * the begin request stays byte-identical to before features existed.
   */
  features?: ConnectionBeginFeatures;
};

export type UseConnectGoogleResult = GoogleUiConfig & {
  /** The scoped connection when passed in, else the aggregate's primary. */
  connection: GoogleSyncConnectionSummary | null;
  isAvailable: boolean;
  /** True while connect/reconnect OAuth is starting (before redirect). */
  isConnecting: boolean;
  /** True while any Compass surface is requesting a Sync refresh. */
  isRefreshing: boolean;
  state: GoogleUiState;
  /**
   * Start connect/reconnect: flushes pending local events, then navigates to
   * the sync service's OAuth consent URL. The same trigger
   * `commandAction.onSelect` wraps this for the sidebar — call this directly
   * from other surfaces (e.g. a toast) instead of reimplementing it
   * (google-reconnect.toast.tsx).
   */
  connect: () => void;
  /**
   * Enqueue Sync catch-up pulls for the signed-in user's calendars. Used by
   * the ATTENTION / delayed Refresh CTA, the delayed toast, and an automatic
   * focus-triggered check (useSyncFocusRefresh). Pass `silent: true` for a
   * background trigger the user didn't ask for, so a transient failure
   * doesn't surface an error toast or close an open command palette. All
   * callers share one in-flight request.
   */
  refresh: (options?: { silent?: boolean }) => void;
};
