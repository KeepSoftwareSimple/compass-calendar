import { type FC } from "react";
import {
  getSidebarSyncStatus,
  SSE_DEGRADED_STATUS,
} from "@web/auth/google/hooks/useConnectGoogle/useConnectGoogle.util";
import { useGoogleSyncRefreshSnapshot } from "@web/auth/google/state/google.sync.refresh";
import { connectionProvider } from "@web/auth/providers/provider-copy.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import {
  selectPrimarySyncConnection,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { useShortcutWriteLocked } from "@web/billing/useBillingWriteLock";
import { SYNC_STATUS_VARIANT_CLASSNAME } from "@web/calendars/sync-status.types";
import { useHasPendingEventMutations } from "@web/events/mutations/useEventPending";
import {
  selectDraftActivity,
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { EdgeFocusIndicator } from "@web/grid/shortcuts/EdgeFocusIndicator";
import {
  selectEdgeFocusActive,
  selectEdgeFocusAnnouncement,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { KeyboardPlaceIndicator } from "@web/grid/shortcuts/KeyboardPlaceIndicator";
import { settingsActions } from "@web/settings/settings.store";
import { pointerShortcutAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
import { QuickTimeIndicator } from "@web/shortcuts/quick-time/QuickTimeIndicator";
import { EventJumpIndicator } from "@web/shortcuts/shift-hint/EventJumpIndicator";
import {
  selectEventJumpActive,
  selectEventJumpAnnouncement,
  selectQuickTimeDigits,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { ShortcutTipIndicator } from "@web/shortcuts/tips/ShortcutTipIndicator";
import { useShortcutHintContext } from "@web/shortcuts/tips/useShortcutHintContext";
import { useSseDegraded } from "@web/sse/hooks/useSseDegraded";
import { TimeTravelIndicator } from "@web/timezone/TimeTravelIndicator";
import { useTimeTravelZone } from "@web/timezone/time-travel.store";

/**
 * Pinned status bar at the bottom of the sidebar, just above the actions bar.
 * Always occupies at least one line so nothing in the sidebar can shift when a
 * mutation goes in/out of flight, or an account's Google sync status changes -
 * that status used to render inline under each account's heading, where it
 * pushed the calendar rows below it up and down as accounts synced.
 *
 * Mode indicators and operational status temporarily own the line; otherwise
 * the bar always shows the next shortcut. The sync-status control is a button
 * that opens Settings > Accounts, where the full sentence fits.
 */
export const SidebarStatusBar: FC = () => {
  const hint = useShortcutHintContext();
  const writeLocked = useShortcutWriteLocked();
  const quickTimeDigits = useEventJumpStore(selectQuickTimeDigits);
  const isEventJump = useEventJumpStore(selectEventJumpActive);
  const eventJumpAnnouncement = useEventJumpStore(selectEventJumpAnnouncement);
  const showEventJump = isEventJump || Boolean(eventJumpAnnouncement);
  const isEdgeFocus = useEdgeFocusStore(selectEdgeFocusActive);
  const edgeFocusAnnouncement = useEdgeFocusStore(selectEdgeFocusAnnouncement);
  const showEdgeFocus = isEdgeFocus || Boolean(edgeFocusAnnouncement);
  const draftActivity = useDraftStore(selectDraftActivity);
  const isDraftFormOpen = useDraftStore(selectIsEventFormOpen);
  const isKeyboardPlace = draftActivity === "keyboardPlace" && !isDraftFormOpen;
  const isTimeTraveling = useTimeTravelZone() !== null;
  const isSaving = useHasPendingEventMutations();
  // The unscoped hook's `connection` is the primary connection (the one
  // whose own state matches the aggregate) - without it, an account's
  // routine incremental catch-up looks identical to a brand-new import: both
  // collapse to the aggregate "IMPORTING" state, and only the connection's
  // own lastHealthyAt tells getSidebarSyncStatus the account was already
  // established and should stay quiet.
  const primary = useUserMetadataStore(selectPrimarySyncConnection);
  const { connection, isConnecting, state } = useConnectProvider(
    connectionProvider(primary),
    { connection: primary },
  );
  const refreshSnapshot = useGoogleSyncRefreshSnapshot();
  const sseDegraded = useSseDegraded();
  const syncStatus = getSidebarSyncStatus({
    connection,
    isConnecting,
    state,
    refreshGaveUp: refreshSnapshot.gaveUp,
    refreshInFlight: refreshSnapshot.isRefreshing,
  });
  // sseDegraded only fills in when sync itself has nothing to say (a silent
  // "healthy" null) - a real reconnect/attention/importing status is always
  // more useful and must not be preempted by the live-updates warning.
  const status = isSaving
    ? { variant: "syncing" as const, text: "Saving changes…" }
    : (syncStatus ?? (sseDegraded ? SSE_DEGRADED_STATUS : null));

  const text = status?.text ?? "";

  // Highest-priority active indicator wins the bar; the next-shortcut hint
  // is the idle default. Operational status uses the settings button.
  // A half-typed time is the most transient state on the bar, and it lapses on
  // its own in well under a second, so it outranks every mode indicator.
  const indicator = quickTimeDigits ? (
    <QuickTimeIndicator />
  ) : showEventJump ? (
    <EventJumpIndicator />
  ) : showEdgeFocus ? (
    <EdgeFocusIndicator />
  ) : isKeyboardPlace ? (
    <KeyboardPlaceIndicator />
  ) : !status ? (
    isTimeTraveling ? (
      <TimeTravelIndicator />
    ) : (
      <ShortcutTipIndicator hint={hint} locked={writeLocked} />
    )
  ) : null;

  return (
    <div className="flex min-h-6 shrink-0 items-center justify-center px-4 py-0.5">
      {indicator ? (
        <div className="flex min-w-0 flex-1 items-center justify-center">
          {indicator}
        </div>
      ) : (
        <button
          aria-label={
            text ? `${text}. Open account settings` : "Open account settings"
          }
          className="c-focus-ring flex min-w-0 flex-1 items-center justify-center self-stretch rounded-xs"
          onClick={() => settingsActions.openSettings()}
          title={text || undefined}
          type="button"
          {...pointerShortcutAttributes(["Mod", ","])}
        >
          <span
            aria-live="polite"
            className={`break-words text-center text-xs leading-5 ${status ? SYNC_STATUS_VARIANT_CLASSNAME[status.variant] : ""}`}
            role="status"
          >
            {text}
          </span>
        </button>
      )}
    </div>
  );
};
