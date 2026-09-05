import { createElement } from "react";
import { type Id } from "react-toastify";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { type GoogleReconnectTarget } from "@web/auth/google/state/google.reconnect.state";
import {
  connectionProvider,
  RECONNECT_CALENDAR_LABEL,
  reconnectToastBody,
  reconnectToastTitle,
} from "@web/auth/providers/provider-copy.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import {
  rememberPendingReconnect,
  shouldDeferAttentionToasts,
  takePendingReconnect,
} from "@web/billing/billing-gate-attention";
import { GOOGLE_REVOKED_TOAST_ID } from "@web/common/constants/toast.constants";
import {
  ErrorToastSeverity,
  showErrorToast,
} from "@web/common/utils/toast/error-toast.util";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { CONNECTION_BANNER_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

let hasShownReconnectToastThisLoad = false;
let lastReconnectTarget: GoogleReconnectTarget = {};

/** True after any path has already raised the reconnect toast this page load. */
export const hasShownGoogleReconnectToastThisLoad = (): boolean =>
  hasShownReconnectToastThisLoad;

export const clearGoogleReconnectToastGate = (): void => {
  hasShownReconnectToastThisLoad = false;
};

export function resetGoogleReconnectToastStateForTests(): void {
  hasShownReconnectToastThisLoad = false;
  lastReconnectTarget = {};
}

interface GoogleReconnectToastProps {
  toastId: Id;
  accountEmail?: string | null;
  connectionId?: string | null;
  provider?: ProviderKind;
}

const toastScopedConnection = (
  connectionId: string | null | undefined,
  accountEmail: string | null | undefined,
  provider: ProviderKind,
): SyncConnectionSummary => ({
  id: connectionId?.trim() || "reconnect-target",
  provider,
  state: "actionRequired",
  stateReason: "authorizationRevoked",
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: accountEmail ?? null,
  connectionState: "RECONNECT_REQUIRED",
  // A synthetic reconnect target, not a real summary — the credential is
  // broken, so no capability can be assumed granted.
  canSuggestContacts: false,
});

// Shown when Google reports invalid_grant, which covers both "access expired"
// and "user revoked access" with no way to tell them apart, so the copy must
// stay accurate for either cause. Hooks are fine here: ToastContainer renders
// inside GoogleOAuthProvider (CompassProvider).
//
// Delegates to useConnectProvider's connect() — the same trigger the command
// palette uses — rather than driving the OAuth redirect flow directly, so
// this toast can't drift out of sync with the one place that flow lives.
export const GoogleReconnectToast = ({
  toastId,
  accountEmail,
  connectionId,
  provider: providerProp,
}: GoogleReconnectToastProps) => {
  const connections = useUserMetadataStore(selectSyncConnections);
  const connectionFromStore =
    connections.find((entry) => entry.id === connectionId) ??
    connections.find((entry) => entry.accountEmail === accountEmail) ??
    null;
  const kind = connectionProvider(
    connectionFromStore ?? (providerProp ? { provider: providerProp } : null),
  );
  // Props keep the target even while metadata is refetching, so Reconnect
  // still binds OAuth to the broken connectionId instead of adding a new one.
  const connection =
    connectionFromStore ??
    (connectionId
      ? toastScopedConnection(connectionId, accountEmail, kind)
      : null);
  const { connect } = useConnectProvider(
    kind,
    connection ? { connection } : undefined,
  );

  const handleReconnect = () => {
    getToast().dismiss(toastId);
    connect();
  };

  const namedAccount = accountEmail?.trim();

  return (
    <ToastNotice>
      <p className="font-medium text-sm text-text">
        {reconnectToastTitle(kind, namedAccount)}
      </p>
      <p className="text-sm text-text">
        {reconnectToastBody(kind, namedAccount)}
      </p>
      <ToastActionButton
        onClick={handleReconnect}
        shortcutKey={CONNECTION_BANNER_SHORTCUT_KEY}
      >
        {RECONNECT_CALENDAR_LABEL[kind]}
      </ToastActionButton>
    </ToastNotice>
  );
};

export function showGoogleReconnectToast(
  target: GoogleReconnectTarget = {},
): Id {
  lastReconnectTarget = target;
  if (shouldDeferAttentionToasts()) {
    rememberPendingReconnect(target);
    return GOOGLE_REVOKED_TOAST_ID;
  }

  hasShownReconnectToastThisLoad = true;
  return showErrorToast(
    createElement(GoogleReconnectToast, {
      toastId: GOOGLE_REVOKED_TOAST_ID,
      accountEmail: target.accountEmail,
      connectionId: target.connectionId,
    }),
    {
      toastId: GOOGLE_REVOKED_TOAST_ID,
      severity: ErrorToastSeverity.CRITICAL,
    },
  );
}

export function deferGoogleReconnectToastIfVisible(): void {
  const toast = getToast();
  const visible = toast.isActive?.(GOOGLE_REVOKED_TOAST_ID) === true;
  if (!visible && !hasShownReconnectToastThisLoad) return;

  rememberPendingReconnect(lastReconnectTarget);
  hasShownReconnectToastThisLoad = false;
  dismissGoogleReconnectToast();
}

export function flushDeferredGoogleReconnectToast(): void {
  const pending = takePendingReconnect();
  if (!pending) return;
  showGoogleReconnectToast(pending);
}

export function dismissGoogleReconnectToast(): void {
  getToast().dismiss(GOOGLE_REVOKED_TOAST_ID);
}
