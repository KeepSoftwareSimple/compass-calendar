import { type FC, Suspense, useEffect, useRef, useState } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { providerDisplayName } from "@core/types/sync/identity.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { useSession } from "@web/auth/compass/session/useSession";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import {
  formatLastSyncedLabel,
  getGoogleSyncStatus,
  googleSyncSupportMailto,
  SSE_DEGRADED_STATUS,
} from "@web/auth/providers/connect.util";
import { connectionProviderKind } from "@web/auth/providers/connection-provider.util";
import { CALENDAR_HOST_EXPLAINER } from "@web/auth/providers/provider-copy.util";
import { useGoogleSyncRefreshSnapshot } from "@web/auth/providers/sync.refresh";
import { useDisconnectGoogleAccount } from "@web/auth/providers/useDisconnectAccount";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { PlanSection } from "@web/billing/PlanSection";
import { getPlanBadge } from "@web/billing/planBadge";
import { useUpgradeConfirmation } from "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation";
import { useAppAccess } from "@web/billing/useAppAccess";
import { LazyBookingSettingsSection as BookingSettingsSection } from "@web/booking/BookingSettingsSection.lazy";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import {
  compareCalendars,
  getWritableCalendars,
  groupCalendarsByAccount,
} from "@web/calendars/calendar.util";
import {
  setDefaultCalendarId,
  useDefaultCalendarId,
} from "@web/calendars/default-calendar.store";
import { SyncStatusLine } from "@web/calendars/SyncStatusLine";
import {
  useConnectedAccountEmails,
  useDefaultTargetCalendar,
} from "@web/calendars/useDefaultTargetCalendar";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { EXPORT_MY_DATA_TOAST_ID } from "@web/common/constants/toast.constants";
import { runExportMyData } from "@web/common/storage/offline-data/export-user-data.util";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { useDeleteAccountConfirmation } from "@web/components/DeleteAccountConfirmation/hooks/useDeleteAccountConfirmation";
import { useLogoutConfirmation } from "@web/components/LogoutConfirmation/hooks/useLogoutConfirmation";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  selectIsSettingsOpen,
  selectSettingsPage,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { usePaletteAwareOverlayDismiss } from "@web/settings/usePaletteAwareOverlayDismiss";
import {
  settingsShortcutAttrs,
  useSettingsShortcuts,
} from "@web/settings/useSettingsShortcuts";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { useSseDegraded } from "@web/sse/hooks/useSseDegraded";
import { DefaultTimezonePicker } from "@web/timezone/DefaultTimezonePicker";

const OUTLINE_BUTTON_CLASSNAME =
  "c-focus-ring shrink-0 rounded border border-border bg-surface-overlay px-2 py-1 text-xs text-text transition-colors hover:bg-surface-panel disabled:pointer-events-none disabled:opacity-60";

const navButtonClassName = (current: boolean) =>
  current
    ? "c-focus-ring flex w-full items-center justify-between rounded bg-surface-overlay px-2 py-1 text-left text-sm text-text"
    : "c-focus-ring flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-text";

/**
 * The app's Settings menu (Mod+,): Accounts (timezone, calendars, Google
 * connections, export / delete / log out) and Billing (plan) as sibling
 * pages. ESC steps back a level - out of an open disconnect
 * confirmation first, then out of a dirty Booking form's discard
 * prompt, then out of the modal - via `handleDismiss`, since
 * OverlayPanel already routes both ESC and a backdrop click through
 * `onDismiss`.
 */
export const SettingsModal: FC = () => {
  const isOpen = useSettingsStore(selectIsSettingsOpen);
  const page = useSettingsStore(selectSettingsPage);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const reseatFocusOnAccountsRef = useRef(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const bookingDismissGuardRef = useRef<(() => boolean) | null>(null);
  const { skipFocusRestoreRef, handleDismiss: dismissToPalette } =
    usePaletteAwareOverlayDismiss(isOpen, settingsActions.closeSettings);
  useAppLockReason("settingsModal", isOpen);
  const { openDeleteAccountConfirmation } = useDeleteAccountConfirmation();
  const { authenticated } = useSession();
  const { openLogoutConfirmation } = useLogoutConfirmation();
  const { isOpen: isUpgradeOpen } = useUpgradeConfirmation();
  const access = useAppAccess();
  const hasBilling = getPlanBadge(access) !== null;
  const { areHintsVisible } = useSettingsShortcuts({
    enabled: isOpen && !isUpgradeOpen,
    hasBilling,
    hasBooking: authenticated && IS_BOOKING_ENABLED,
    page,
  });

  // The modal stays mounted (self-reads the store) so a stray close path
  // that skips handleDismiss (e.g. the Mod+, toggle) can't leave a
  // disconnect confirmation pre-armed on next open.
  useEffect(() => {
    if (!isOpen) setConfirmingId(null);
  }, [isOpen]);

  // Fail-open and in-flight status both look like `kind: "open"` (no badge).
  // Bounce only once the server says there is no plan; otherwise a slow
  // status load would snap to Accounts before Billing is ready.
  // The Billing nav unmounts on that bounce, so reseat focus on Accounts or
  // it falls to document.body and Escape no longer dismisses the dialog.
  useEffect(() => {
    if (page === "billing" && access.kind === "server" && !hasBilling) {
      reseatFocusOnAccountsRef.current = true;
      settingsActions.setSettingsPage("accounts");
    }
  }, [access.kind, hasBilling, page]);

  useEffect(() => {
    if (!reseatFocusOnAccountsRef.current || page !== "accounts") return;
    reseatFocusOnAccountsRef.current = false;
    initialFocusRef.current?.focus();
  }, [page]);

  const { data } = useCalendarsQuery();
  const connections = useUserMetadataStore(selectSyncConnections);
  const accountEmailOrder = useConnectedAccountEmails();
  // useDefaultTargetCalendar subscribes to session reconnect overrides, so
  // writableCalendars recomputes when a 410 lands before Sync metadata catches up.
  const writableCalendars = getWritableCalendars(data ?? [], {
    hasConnectedAccount: accountEmailOrder.length > 0,
  }).sort(compareCalendars(accountEmailOrder));
  const resolvedDefault = useDefaultTargetCalendar(writableCalendars);

  if (!isOpen) return null;

  const handleDismiss = () => {
    // The upgrade dialog stacks on top of Settings (unlike delete/logout,
    // which close Settings first). Escape must not dismiss this panel while
    // the confirmation still owns the screen.
    if (isUpgradeOpen) return;
    if (confirmingId !== null) {
      setConfirmingId(null);
      return;
    }
    // Booking form is dirty: ask before dropping the modal. The e-leader
    // capture-phase Escape never reaches here.
    if (bookingDismissGuardRef.current?.()) return;
    dismissToPalette();
  };

  const handleExport = () => {
    runExportMyData()
      .then(() => {
        showStatusToast(EXPORT_MY_DATA_TOAST_ID, "Data exported");
      })
      .catch(() => {
        showErrorToast("Couldn't export your data. Please try again.", {
          toastId: EXPORT_MY_DATA_TOAST_ID,
        });
      });
  };

  // Closes Settings first rather than stacking two OverlayPanels at once.
  const handleDeleteAccount = () => {
    settingsActions.closeSettings();
    openDeleteAccountConfirmation();
  };

  // Closes Settings first rather than stacking two OverlayPanels at once.
  const handleLogout = () => {
    settingsActions.closeSettings();
    openLogoutConfirmation();
  };

  return (
    <OverlayPanel
      align="start"
      initialFocusRef={initialFocusRef}
      onDismiss={handleDismiss}
      skipFocusRestoreRef={skipFocusRestoreRef}
      title="Settings"
      titleAction={
        <OverlayPanelActionButton
          className="shrink-0"
          onClick={handleDismiss}
          shortcut="Esc"
          variant="ghost"
        >
          Close
        </OverlayPanelActionButton>
      }
      variant="modal"
      widthClassName="w-[640px]"
    >
      <div className="flex w-full gap-6">
        <nav className="w-32 shrink-0">
          <button
            aria-current={page === "accounts" ? "true" : undefined}
            className={navButtonClassName(page === "accounts")}
            onClick={() => settingsActions.setSettingsPage("accounts")}
            onPointerEnter={focusOnPointerEnter}
            ref={page === "accounts" ? initialFocusRef : undefined}
            type="button"
            {...settingsShortcutAttrs("nav-accounts")}
          >
            Accounts
            {areHintsVisible ? <ShortcutKeys keys="1" /> : null}
          </button>
          {hasBilling || page === "billing" ? (
            <button
              aria-current={page === "billing" ? "true" : undefined}
              className={navButtonClassName(page === "billing")}
              onClick={() => settingsActions.setSettingsPage("billing")}
              onPointerEnter={focusOnPointerEnter}
              ref={page === "billing" ? initialFocusRef : undefined}
              type="button"
              {...settingsShortcutAttrs("nav-billing")}
            >
              Billing
              {areHintsVisible ? <ShortcutKeys keys="2" /> : null}
            </button>
          ) : null}
          {authenticated && IS_BOOKING_ENABLED ? (
            <button
              aria-current={page === "booking" ? "true" : undefined}
              className={navButtonClassName(page === "booking")}
              onClick={() => settingsActions.setSettingsPage("booking")}
              onPointerEnter={focusOnPointerEnter}
              ref={page === "booking" ? initialFocusRef : undefined}
              type="button"
              {...settingsShortcutAttrs("nav-booking")}
            >
              Booking
              {areHintsVisible ? <ShortcutKeys keys="3" /> : null}
            </button>
          ) : null}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {page === "billing" ? (
            <PlanSection showShortcuts={areHintsVisible} />
          ) : page === "booking" && IS_BOOKING_ENABLED ? (
            <Suspense fallback={null}>
              <BookingSettingsSection
                dismissGuardRef={bookingDismissGuardRef}
                onDiscardUnsaved={dismissToPalette}
                showShortcuts={areHintsVisible}
              />
            </Suspense>
          ) : (
            <>
              <DefaultTimezonePicker />
              <DefaultCalendarPicker
                calendars={writableCalendars}
                connections={connections}
                resolvedDefault={resolvedDefault}
              />
              <AccountsSection
                confirmingId={confirmingId}
                connections={connections}
                resolvedDefault={resolvedDefault}
                setConfirmingId={setConfirmingId}
                showShortcuts={areHintsVisible}
              />
              <div className="mt-2 border-border border-t pt-3">
                <OverlayPanelActions align="start">
                  <OverlayPanelActionButton
                    onClick={handleExport}
                    shortcut="E"
                    showShortcut={areHintsVisible}
                    variant="secondary"
                    {...settingsShortcutAttrs("export")}
                  >
                    Export data
                  </OverlayPanelActionButton>
                  <OverlayPanelActionButton
                    onClick={handleDeleteAccount}
                    shortcut="D"
                    showShortcut={areHintsVisible}
                    variant="destructive"
                    {...settingsShortcutAttrs("delete-account")}
                  >
                    Delete account
                  </OverlayPanelActionButton>
                  {authenticated ? (
                    <OverlayPanelActionButton
                      onClick={handleLogout}
                      shortcut="O"
                      showShortcut={areHintsVisible}
                      {...settingsShortcutAttrs("log-out")}
                    >
                      Log out
                    </OverlayPanelActionButton>
                  ) : null}
                </OverlayPanelActions>
              </div>
            </>
          )}
        </div>
      </div>
    </OverlayPanel>
  );
};

interface DefaultCalendarPickerProps {
  calendars: Calendar[];
  connections: SyncConnectionSummary[];
  resolvedDefault: Calendar | undefined;
}

const DefaultCalendarPicker: FC<DefaultCalendarPickerProps> = ({
  calendars,
  connections,
  resolvedDefault,
}) => {
  const storedId = useDefaultCalendarId();
  const value = storedId ?? resolvedDefault?.id ?? "";

  if (calendars.length === 0) return null;

  const { groups, ungrouped } = groupCalendarsByAccount(calendars, connections);

  return (
    <div>
      <label
        className="mb-1 block text-sm text-text"
        htmlFor="default-calendar"
      >
        Default Calendar
      </label>
      <select
        className="c-focus-ring w-full rounded border border-border bg-surface-overlay px-2 py-1 text-sm text-text hover:bg-surface-panel"
        id="default-calendar"
        onChange={(e) => setDefaultCalendarId(e.target.value as CalendarId)}
        value={value}
      >
        {groups
          .filter((group) => group.calendars.length > 0)
          .map((group) => (
            <optgroup
              key={group.accountEmail}
              label={`${group.accountEmail} (${providerDisplayName(connectionProviderKind(group.connection))})`}
            >
              {group.calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </optgroup>
          ))}
        {ungrouped.map((calendar) => (
          <option key={calendar.id} value={calendar.id}>
            {calendar.name}
          </option>
        ))}
      </select>
    </div>
  );
};

interface AccountsSectionProps {
  confirmingId: string | null;
  connections: SyncConnectionSummary[];
  resolvedDefault: Calendar | undefined;
  setConfirmingId: (id: string | null) => void;
  showShortcuts: boolean;
}

const AccountsSection: FC<AccountsSectionProps> = ({
  confirmingId,
  connections,
  resolvedDefault,
  setConfirmingId,
  showShortcuts,
}) => {
  const { disconnect, disconnectingId } = useDisconnectGoogleAccount();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {connections.length === 0 ? (
          <p className="text-sm text-text-muted">No accounts connected yet.</p>
        ) : (
          connections.map((connection) => (
            <AccountRow
              connection={connection}
              disconnect={disconnect}
              isConfirming={confirmingId === connection.id}
              isDefault={
                connection.accountEmail === resolvedDefault?.accountEmail
              }
              isDisconnecting={disconnectingId === connection.id}
              key={connection.id}
              setConfirming={(confirming) =>
                setConfirmingId(confirming ? connection.id : null)
              }
            />
          ))
        )}
      </div>

      <OverlayPanelActions align="start">
        <ConnectProviderChooser
          idleLabel="Add account"
          newAccount
          showShortcut={showShortcuts}
          shortcut="A"
          shortcutAttrs={settingsShortcutAttrs("add-account")}
          variant="overlay-primary"
        />
      </OverlayPanelActions>
      <p className="text-text-muted text-xs">{CALENDAR_HOST_EXPLAINER}</p>
    </div>
  );
};

interface AccountRowProps {
  connection: SyncConnectionSummary;
  disconnect: (connectionId: string, accountEmail: string) => Promise<void>;
  isConfirming: boolean;
  isDefault: boolean;
  isDisconnecting: boolean;
  setConfirming: (confirming: boolean) => void;
}

/**
 * One connected account: email, its own full sync status (including when
 * healthy - the sidebar hides that, but this is the one place a user comes
 * to check), a "Default" badge when it owns the default calendar, and a
 * two-step disconnect (not undoable without redoing the whole OAuth flow).
 */
const AccountRow: FC<AccountRowProps> = ({
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
      </div>
      {isConfirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-busy={isDisconnecting || undefined}
            aria-label={`Confirm disconnecting ${accountEmail}`}
            className={`${OUTLINE_BUTTON_CLASSNAME} text-error`}
            disabled={isDisconnecting}
            onClick={() =>
              void disconnect(connection.id, accountEmail).finally(() =>
                setConfirming(false),
              )
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
