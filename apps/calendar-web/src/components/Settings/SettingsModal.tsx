import { type FC, Suspense, useEffect, useRef, useState } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { PlanSection } from "@web/billing/PlanSection";
import { getPlanBadge } from "@web/billing/planBadge";
import { useUpgradeConfirmation } from "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation";
import { useAppAccess } from "@web/billing/useAppAccess";
import { LazyBookingSettingsSection as BookingSettingsSection } from "@web/booking/BookingSettingsSection.lazy";
import {
  useBookingPageQuery,
  useBookingStatusQuery,
} from "@web/booking/booking.query";
import { isLiveBookingPage } from "@web/booking/booking.util";
import { BOOKING_NAV_NEEDS_ATTENTION } from "@web/booking/booking-bookability.copy";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import {
  compareCalendars,
  getWritableCalendars,
} from "@web/calendars/calendar.util";
import {
  useConnectedAccountEmails,
  useDefaultTargetCalendar,
} from "@web/calendars/useDefaultTargetCalendar";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { EXPORT_MY_DATA_TOAST_ID } from "@web/common/constants/toast.constants";
import { runExportMyData } from "@web/common/storage/offline-data/export-user-data.util";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { useDeleteAccountConfirmation } from "@web/components/DeleteAccountConfirmation/hooks/useDeleteAccountConfirmation";
import { useLogoutConfirmation } from "@web/components/LogoutConfirmation/hooks/useLogoutConfirmation";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { AccountsSection } from "@web/components/Settings/AccountsSection";
import { DefaultCalendarPicker } from "@web/components/Settings/DefaultCalendarPicker";
import { DesktopLaunchAtLoginSection } from "@web/components/Settings/DesktopLaunchAtLoginSection";
import { DesktopQuickAddHotkeySection } from "@web/components/Settings/DesktopQuickAddHotkeySection";
import { SettingsNavButton } from "@web/components/Settings/SettingsNavButton";
import {
  selectGuestMeetingSetupActive,
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
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";
import { DefaultTimezonePicker } from "@web/timezone/DefaultTimezonePicker";

export const SETTINGS_HOLD_MOD_HINT_PARTS: readonly ShortcutTipPart[] = [
  "Hold ",
  { keys: ["Mod"] },
  " to see shortcuts.",
];

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
  const guestMeetingSetupActive = useSettingsStore(
    selectGuestMeetingSetupActive,
  );
  const guestMeetingPreview =
    guestMeetingSetupActive && !authenticated && IS_BOOKING_ENABLED;
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

  // SettingsModalHost unmounts this tree while closed, which also clears
  // confirmingId. Keep the reset for the Mod+, toggle (and any other close
  // path that skips handleDismiss) in case the host stays mounted.
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
  const showBookingNav =
    (authenticated && IS_BOOKING_ENABLED) || guestMeetingPreview;
  const { data: bookingPage } = useBookingPageQuery(
    isOpen && authenticated && IS_BOOKING_ENABLED,
  );
  const meetingPageLive = isLiveBookingPage(bookingPage);
  const { data: bookingStatus } = useBookingStatusQuery(
    isOpen && showBookingNav && meetingPageLive,
  );
  const bookingNeedsAttention =
    meetingPageLive && bookingStatus?.bookable === false;
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
    // Booking form is dirty: ask before dropping the modal.
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
      anchor="top"
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
        {guestMeetingPreview ? null : (
          <nav className="w-32 shrink-0">
            <SettingsNavButton
              currentPage={page}
              initialFocusRef={initialFocusRef}
              label="Accounts"
              page="accounts"
              shortcutDigit="1"
              showShortcut={areHintsVisible}
            />
            {hasBilling || page === "billing" ? (
              <SettingsNavButton
                currentPage={page}
                initialFocusRef={initialFocusRef}
                label="Billing"
                page="billing"
                shortcutDigit="2"
                showShortcut={areHintsVisible}
              />
            ) : null}
            {showBookingNav ? (
              <SettingsNavButton
                attention={
                  bookingNeedsAttention ? BOOKING_NAV_NEEDS_ATTENTION : null
                }
                currentPage={page}
                initialFocusRef={initialFocusRef}
                label="Meeting"
                page="booking"
                shortcutDigit="3"
                showShortcut={areHintsVisible}
              />
            ) : null}
            {!areHintsVisible ? (
              <p className="mt-2 px-2 text-text-muted text-xs">
                <ShortcutTipParts parts={SETTINGS_HOLD_MOD_HINT_PARTS} />
              </p>
            ) : null}
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {guestMeetingPreview ? (
            <p className="text-sm text-text-muted">
              Set up your meeting page, then sign up to save and go live.
            </p>
          ) : null}
          {page === "billing" ? (
            <PlanSection showShortcuts={areHintsVisible} />
          ) : page === "booking" && showBookingNav ? (
            <Suspense
              fallback={<div aria-hidden className="min-h-[28rem] w-full" />}
            >
              <BookingSettingsSection
                dismissGuardRef={bookingDismissGuardRef}
                onDiscardUnsaved={dismissToPalette}
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
              <DesktopQuickAddHotkeySection />
              <DesktopLaunchAtLoginSection />
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
