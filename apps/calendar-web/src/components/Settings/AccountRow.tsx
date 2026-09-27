import { type FC, useEffect, useRef } from "react";
import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  formatLastSyncedLabel,
  getGoogleSyncStatus,
  googleSyncSupportMailto,
  SSE_DEGRADED_STATUS,
} from "@web/auth/providers/connect.util";
import { MICROSOFT_SELF_HOSTING_DOC_URL } from "@web/auth/providers/connection-health-copy.util";
import { connectionProviderKind } from "@web/auth/providers/connection-provider.util";
import { ProviderMark } from "@web/auth/providers/ProviderMark";
import { useGoogleSyncRefreshSnapshot } from "@web/auth/providers/sync.refresh";
import { SyncStatusLine } from "@web/calendars/SyncStatusLine";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { useSseDegraded } from "@web/sse/hooks/useSseDegraded";

const OUTLINE_BUTTON_CLASSNAME =
  "c-focus-ring shrink-0 rounded border border-border bg-surface-overlay px-2 py-1 text-xs text-text transition-colors hover:bg-surface-panel disabled:pointer-events-none disabled:opacity-60";

interface AccountRowProps {
  connection: SyncConnectionSummary;
  disconnect: (connection: SyncConnectionSummary) => Promise<void>;
  isConfirming: boolean;
  isDefault: boolean;
  isDisconnecting: boolean;
  setConfirming: (confirming: boolean) => void;
}

/**
 * One connected account: email with its provider mark (the same address can
 * be connected on two providers), its own full sync status (including when
 * healthy - the sidebar hides that, but this is the one place a user comes
 * to check), a "Default" badge when it owns the default calendar, and a
 * two-step disconnect (not undoable without redoing the whole OAuth flow).
 */
export const AccountRow: FC<AccountRowProps> = ({
  connection,
  disconnect,
  isConfirming,
  isDefault,
  isDisconnecting,
  setConfirming,
}) => {
  const accountEmail = connection.accountEmail ?? "Unknown account";
  const refreshSnapshot = useGoogleSyncRefreshSnapshot();
  const sseDegraded = useSseDegraded();
  const syncStatus = getGoogleSyncStatus(
    connection.connectionState ?? "NOT_CONNECTED",
    connection,
    Date.now(),
    {
      refreshGaveUp: refreshSnapshot.gaveUp,
      refreshInFlight: refreshSnapshot.isRefreshing,
    },
  );
  // Only override an otherwise-healthy "Calendar connected" - a real
  // reconnect/attention/importing status already says something more
  // important and must not be preempted by the live-updates warning.
  const isOtherwiseHealthy = syncStatus?.variant === "healthy";
  const status =
    isOtherwiseHealthy && sseDegraded ? SSE_DEGRADED_STATUS : syncStatus;
  // The "Updated N minutes ago" freshness claim is exactly the thing that
  // goes silently stale on a dead SSE stream - suppress it rather than
  // presenting last-known data as current.
  const lastSyncedLabel =
    isOtherwiseHealthy && sseDegraded
      ? null
      : formatLastSyncedLabel(connection.lastSyncedAt);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const disconnectButtonRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingRef = useRef(isConfirming);

  // Both directions replace whichever button had focus with a fresh one, so
  // without this, focus falls back to <body> - outside the panel, which
  // breaks the modal's ESC-steps-back handling (OverlayPanel's Escape
  // listener only fires for events bubbling from inside it).
  useEffect(() => {
    if (isConfirming) confirmButtonRef.current?.focus();
    else if (wasConfirmingRef.current) disconnectButtonRef.current?.focus();
    wasConfirmingRef.current = isConfirming;
  }, [isConfirming]);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <ProviderMark provider={connectionProviderKind(connection)} />
          <p className="truncate text-sm text-text" translate="no">
            {accountEmail}
          </p>
          {isDefault ? (
            <span className="shrink-0 rounded border border-border px-1.5 text-text-muted text-xs">
              Default
            </span>
          ) : null}
        </div>
        <SyncStatusLine status={status} />
        {lastSyncedLabel ? (
          <p className="text-text-muted text-xs">{lastSyncedLabel}</p>
        ) : null}
        {refreshSnapshot.gaveUp && connection.state === "delayed" ? (
          <p className="text-text-muted text-xs">
            <a
              className="underline hover:text-text"
              href={googleSyncSupportMailto}
            >
              Email support
            </a>
          </p>
        ) : null}
        {connection.stateReason === "consentRequired" ? (
          <p className="text-text-muted text-xs">
            <a
              className="underline hover:text-text"
              href={MICROSOFT_SELF_HOSTING_DOC_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Admin consent setup guide
            </a>
          </p>
        ) : null}
      </div>
      {isConfirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-busy={isDisconnecting || undefined}
            aria-label={`Confirm disconnecting ${accountEmail}`}
            className={`${OUTLINE_BUTTON_CLASSNAME} text-error`}
            disabled={isDisconnecting}
            onClick={() =>
              void disconnect(connection).finally(() => setConfirming(false))
            }
            onPointerEnter={focusOnPointerEnter}
            ref={confirmButtonRef}
            type="button"
          >
            {isDisconnecting ? "Disconnecting…" : "Confirm"}
          </button>
          <button
            className={OUTLINE_BUTTON_CLASSNAME}
            disabled={isDisconnecting}
            onClick={() => setConfirming(false)}
            onPointerEnter={focusOnPointerEnter}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          aria-label={`Disconnect ${accountEmail}`}
          className={OUTLINE_BUTTON_CLASSNAME}
          onClick={() => setConfirming(true)}
          onPointerEnter={focusOnPointerEnter}
          ref={disconnectButtonRef}
          type="button"
        >
          Disconnect
        </button>
      )}
    </div>
  );
};
