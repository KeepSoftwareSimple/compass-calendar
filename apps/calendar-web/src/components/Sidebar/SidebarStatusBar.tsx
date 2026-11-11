import { type FC, useMemo } from "react";
import {
  calendarGridSidebarModeHintsEligible,
  sidebarDatePickerHintEligible,
} from "@core/shortcuts/sidebar-hint-surface";
import {
  getAggregateSidebarSyncStatus,
  SSE_DEGRADED_STATUS,
} from "@web/auth/providers/connect.util";
import { useGoogleSyncRefreshSnapshot } from "@web/auth/providers/sync.refresh";
import { useConnectGoogle } from "@web/auth/providers/useConnectProvider";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { useShortcutWriteLocked } from "@web/billing/useBillingWriteLock";
import { SYNC_STATUS_VARIANT_CLASSNAME } from "@web/calendars/sync-status.types";
import { isCalendarGridPathname } from "@web/components/RootShell/isCalendarGridPathname";
import { useHasPendingEventMutations } from "@web/events/mutations/useEventPending";
import { EventPastePreviewIndicator } from "@web/events/paste-preview/EventPastePreviewIndicator";
import {
  selectDraftActivity,
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  selectEventPastePreviewActive,
  useEventPastePreviewStore,
} from "@web/events/stores/event-paste-preview.store";
import { EdgeFocusIndicator } from "@web/grid/shortcuts/EdgeFocusIndicator";
import {
  selectEdgeFocusActive,
  selectEdgeFocusAnnouncement,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { KeyboardPlaceIndicator } from "@web/grid/shortcuts/KeyboardPlaceIndicator";
import { settingsActions } from "@web/settings/settings.store";
import { QuickTimeIndicator } from "@web/shortcuts/quick-time/QuickTimeIndicator";
import { EventJumpIndicator } from "@web/shortcuts/shift-hint/EventJumpIndicator";
import {
  selectEventJumpActive,
  selectEventJumpAnnouncement,
  selectQuickTimeDigits,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { DatePickerContextualHint } from "@web/shortcuts/tips/DatePickerContextualHint";
import { useDatePickerHintStore } from "@web/shortcuts/tips/date-picker-hint.store";
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
  const pathname = window.location.pathname;
  const gridModeHintsEligible = calendarGridSidebarModeHintsEligible(pathname);
  const hint = useShortcutHintContext();
  const datePickerStack = useDatePickerHintStore((s) => s.stack);
  const datePickerHintActive = useMemo(
    () =>
      sidebarDatePickerHintEligible(
        pathname,
        datePickerStack.map((surface) => surface.id),
      ),
    [pathname, datePickerStack],
  );
  const writeLocked = useShortcutWriteLocked();
  const quickTimeDigits = useEventJumpStore(selectQuickTimeDigits);
  const isEventJump = useEventJumpStore(selectEventJumpActive);
  const eventJumpAnnouncement = useEventJumpStore(selectEventJumpAnnouncement);
  const showEventJump =
    gridModeHintsEligible && (isEventJump || Boolean(eventJumpAnnouncement));
  const isEdgeFocus = useEdgeFocusStore(selectEdgeFocusActive);
  const edgeFocusAnnouncement = useEdgeFocusStore(selectEdgeFocusAnnouncement);
  const showEdgeFocus =
    gridModeHintsEligible && (isEdgeFocus || Boolean(edgeFocusAnnouncement));
  const draftActivity = useDraftStore(selectDraftActivity);
  const isDraftFormOpen = useDraftStore(selectIsEventFormOpen);
  const isKeyboardPlace =
    gridModeHintsEligible &&
    draftActivity === "keyboardPlace" &&
    !isDraftFormOpen;
  const pastePreviewActive = useEventPastePreviewStore(
    selectEventPastePreviewActive,
  );
  const isPastePreview = gridModeHintsEligible && pastePreviewActive;
  const timeTravelZone = useTimeTravelZone();
  const isTimeTraveling =
    isCalendarGridPathname(pathname) && timeTravelZone !== null;
  const isSaving = useHasPendingEventMutations();
  // The unscoped hook's `connection` is the primary connection (the one
  // whose own state matches the aggregate) - without it, an account's
  // routine incremental catch-up looks identical to a brand-new import: both
  // collapse to the aggregate "IMPORTING" state, and only the connection's
  // own lastHealthyAt tells getSidebarSyncStatus the account was already
  // established and should stay quiet.
  const { isConnecting, state } = useConnectGoogle();
  const connections = useUserMetadataStore(selectSyncConnections);
  const refreshSnapshot = useGoogleSyncRefreshSnapshot();
  const sseDegraded = useSseDegraded();
  const syncStatus = getAggregateSidebarSyncStatus({
    connections,
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
  const showQuickTime = gridModeHintsEligible && Boolean(quickTimeDigits);
  const indicator = showQuickTime ? (
    <QuickTimeIndicator />
  ) : isPastePreview ? (
    <EventPastePreviewIndicator />
  ) : showEventJump ? (
    <EventJumpIndicator />
  ) : showEdgeFocus ? (
    <EdgeFocusIndicator />
  ) : isKeyboardPlace ? (
    <KeyboardPlaceIndicator />
  ) : !status ? (
    isTimeTraveling ? (
      <TimeTravelIndicator />
    ) : datePickerHintActive ? (
      <DatePickerContextualHint />
    ) : hint ? (
      <ShortcutTipIndicator hint={hint} locked={writeLocked} />
    ) : null
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
