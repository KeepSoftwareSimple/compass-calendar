import { Outlet, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { ConnectAppleForm } from "@web/auth/providers/ConnectAppleForm";
import { BillingGateModal } from "@web/billing/BillingGateModal";
import { BillingPastDueBanner } from "@web/billing/BillingPastDueBanner";
import { BillingReadOnlyBanner } from "@web/billing/BillingReadOnlyBanner";
import {
  selectBillingPreviewing,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import { CheckoutCelebrationModal } from "@web/billing/CheckoutCelebrationModal";
import {
  selectIsCelebrating,
  useCheckoutCelebrationStore,
} from "@web/billing/checkout-celebration.store";
import { useAppAccess } from "@web/billing/useAppAccess";
import { useSyncBillingWriteLock } from "@web/billing/useBillingWriteLock";
import { usePlanChangeToasts } from "@web/billing/usePlanChangeToasts";
import { useNewMeetingsNotice } from "@web/booking/useNewMeetingsNotice";
import { isMobileOS } from "@web/common/utils/device/device.util";
import { AuthModal } from "@web/components/AuthModal/AuthModal";
import { AuthModalProvider } from "@web/components/AuthModal/AuthModalProvider";
import { ConnectCalendarPromptGate } from "@web/components/ConnectCalendarPrompt/ConnectCalendarPromptGate";
import { FirstEventPrompt } from "@web/components/FirstEventPrompt/FirstEventPrompt";
import { PointerHint } from "@web/components/PointerHint/PointerHint";
import { ShowcasePlayLink } from "@web/components/ShortcutShowcase/play-link";
import { ShortcutShowcase } from "@web/components/ShortcutShowcase/ShortcutShowcase";
import { WelcomeGuideModal } from "@web/components/WelcomeModal/WelcomeGuideModal";
import { WelcomeModal } from "@web/components/WelcomeModal/WelcomeModal";
import {
  selectWelcomeGuideOpen,
  useWelcomeGuideStore,
} from "@web/components/WelcomeModal/welcome.guide.store";
import { useUpcomingEventNotifier } from "@web/notifications/useUpcomingEventNotifier";
import { useEventContextMenuShortcut } from "@web/shortcuts/context-menu/useEventContextMenuShortcut";
import { usePointerConfusionTracker } from "@web/shortcuts/keyboard-only/usePointerConfusionTracker";
import { useFocusNoticeShortcut } from "@web/shortcuts/notice-focus/useFocusNoticeShortcut";
import {
  useCalendarShellShortcuts,
  useNavigationShortcuts,
} from "@web/shortcuts/useGlobalShortcuts";
import { isLifePathname } from "./isLifePathname";

/**
 * The auth modal is driven by the router's `?auth=` search param, so its
 * provider must live inside the router (a sibling to `RouterProvider` can't
 * call router hooks). Mounting it at the root route also keeps the modal
 * available on every matched route, including 404s.
 */
export function RootShell() {
  const { pathname } = useLocation();
  const isLifeView = isLifePathname(pathname);
  const deferCalendarOnboarding = isLifeView;
  // The keyboard onboarding overlays paint over MobileGate (they're fixed
  // full-screen), so a phone user would finish the whole walkthrough only to
  // land on "open this on a computer". Gate them up front instead.
  const isMobile = useMemo(() => isMobileOS(), []);
  const isWelcomeGuideOpen = useWelcomeGuideStore(selectWelcomeGuideOpen);
  const access = useAppAccess();
  const isPreviewing = useBillingPreviewStore(selectBillingPreviewing);
  const isCelebrating = useCheckoutCelebrationStore(selectIsCelebrating);
  useSyncBillingWriteLock();
  usePlanChangeToasts();
  useNavigationShortcuts();
  useCalendarShellShortcuts();
  usePointerConfusionTracker(!isLifeView);
  useFocusNoticeShortcut();
  useEventContextMenuShortcut();
  // Must stay mounted on every route, including Life, so the 5-minute
  // heads-up still fires while the calendar grid is not on screen.
  useUpcomingEventNotifier();
  // Claims new guest bookings once per load (and on return to the tab
  // after five minutes). No-ops when booking is off or the session is
  // anonymous.
  useNewMeetingsNotice();

  const readOnlyStatus =
    access.kind === "server" && access.isReadOnly ? access.status : null;
  // The look-around is an invitation to start a trial, so it only holds while
  // one is still on offer. If the status moves on (expired, canceled) while
  // previewing, the gate must come back rather than strand the user behind a
  // banner pitching a trial they can no longer take.
  const isPreviewable = readOnlyStatus === "awaiting_checkout";
  const showReadOnlyBanner = isPreviewable && isPreviewing;
  // The gate must yield to the celebration. Between Checkout completing and
  // the webhook landing, status can still read awaiting_checkout, and the gate
  // is a full app-lock overlay: it would take the screen at exactly the
  // moment the user has just paid.
  const gateStatus =
    showReadOnlyBanner || isCelebrating ? null : readOnlyStatus;
  const showCalendarOnboarding =
    gateStatus === null &&
    !isCelebrating &&
    !deferCalendarOnboarding &&
    !isMobile;
  const showPastDue = access.kind === "server" && access.status === "past_due";

  // The gate and the celebration own the screen: the onboarding cards sit at
  // Z_INDEX_TOOLTIP (above Z_INDEX_MODAL), so leaving them mounted would let
  // a gated or celebrating user click straight through and keep touring. They
  // are suppressed rather than living in a second copy of this tree, which
  // keeps Outlet's slot stable — swapping tree shapes remounts the whole
  // calendar.
  return (
    <AuthModalProvider>
      {showPastDue && <BillingPastDueBanner />}
      {showReadOnlyBanner && <BillingReadOnlyBanner />}
      <Outlet />
      <AuthModal />
      <ConnectAppleForm />
      {gateStatus === null && <ConnectCalendarPromptGate />}
      {gateStatus !== null && <BillingGateModal status={gateStatus} />}
      <CheckoutCelebrationModal />
      {showCalendarOnboarding && <WelcomeModal />}
      {showCalendarOnboarding && <ShowcasePlayLink />}
      {showCalendarOnboarding && <ShortcutShowcase />}
      {showCalendarOnboarding && <FirstEventPrompt />}
      {gateStatus === null && isWelcomeGuideOpen && <WelcomeGuideModal />}
      {!isLifeView && <PointerHint />}
    </AuthModalProvider>
  );
}
