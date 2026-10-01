import { Outlet, useLocation, useSearch } from "@tanstack/react-router";
import { useContext, useEffect, useMemo } from "react";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { ConnectAppleForm } from "@web/auth/providers/ConnectAppleForm";
import { MissingPermissionsModal } from "@web/auth/providers/MissingPermissionsModal";
import { BillingGateModal } from "@web/billing/BillingGateModal";
import { BillingPastDueBanner } from "@web/billing/BillingPastDueBanner";
import { CheckoutCelebrationModal } from "@web/billing/CheckoutCelebrationModal";
import { CheckoutOverlay } from "@web/billing/CheckoutOverlay";
import {
  selectIsCelebrating,
  useCheckoutCelebrationStore,
} from "@web/billing/checkout-celebration.store";
import { useAppAccess } from "@web/billing/useAppAccess";
import { useSyncBillingWriteLock } from "@web/billing/useBillingWriteLock";
import { usePlanChangeToasts } from "@web/billing/usePlanChangeToasts";
import { useGuestMeetingSetupEntry } from "@web/booking/useGuestMeetingSetupEntry";
import { useGuestMeetingSetupResume } from "@web/booking/useGuestMeetingSetupResume";
import { useGuestRsvpNotice } from "@web/booking/useGuestRsvpNotice";
import { useNewMeetingsNotice } from "@web/booking/useNewMeetingsNotice";
import { isMobileOS } from "@web/common/utils/device/device.util";
import { AuthModal } from "@web/components/AuthModal/AuthModal";
import { AuthModalProvider } from "@web/components/AuthModal/AuthModalProvider";
import {
  useAuthModalState,
  VIEW_TO_PARAM,
} from "@web/components/AuthModal/hooks/useAuthModal";
import { ConnectCalendarPromptGate } from "@web/components/ConnectCalendarPrompt/ConnectCalendarPromptGate";
import { useConnectCalendarPromptSurfaceEligible } from "@web/components/ConnectCalendarPrompt/useConnectCalendarPromptSurfaceEligible";
import { FirstEventPrompt } from "@web/components/FirstEventPrompt/FirstEventPrompt";
import { useFirstEventPromptSurfaceEligible } from "@web/components/FirstEventPrompt/useFirstEventPromptSurfaceEligible";
import { PointerHint } from "@web/components/PointerHint/PointerHint";
import {
  type OnboardingSurfaceFlags,
  selectActiveSurface,
} from "@web/components/RootShell/onboarding-surface";
import {
  hasPlayDeepLink,
  ShowcasePlayLink,
} from "@web/components/ShortcutShowcase/play-link";
import { ShortcutShowcase } from "@web/components/ShortcutShowcase/ShortcutShowcase";
import {
  selectShortcutShowcaseSurfaceEligible,
  selectShowcaseActive,
  shortcutShowcaseActions,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { WelcomeGuideModal } from "@web/components/WelcomeModal/WelcomeGuideModal";
import { WelcomeModal } from "@web/components/WelcomeModal/WelcomeModal";
import {
  selectWelcomeFirstVisitOpen,
  selectWelcomeGuideOpen,
  selectWelcomeGuideSurfaceEligible,
  useWelcomeGuideStore,
} from "@web/components/WelcomeModal/welcome.guide.store";
import {
  hasSeenWelcome,
  selectWelcomeModalSurfaceEligible,
} from "@web/components/WelcomeModal/welcome.modal.util";
import { useDesktopDeepLink } from "@web/desktop/useDesktopDeepLink";
import { useDesktopMenuShortcutBridge } from "@web/desktop/useDesktopMenuShortcutBridge";
import { useUpcomingEventNotifier } from "@web/notifications/useUpcomingEventNotifier";
import {
  selectGuestMeetingSetupActive,
  useSettingsStore,
} from "@web/settings/settings.store";
import { useSettingsSearchEntry } from "@web/settings/useSettingsSearchEntry";
import { useEventContextMenuShortcut } from "@web/shortcuts/context-menu/useEventContextMenuShortcut";
import { useGoToDateShortcut } from "@web/shortcuts/go-to-date/useGoToDateShortcut";
import { useHideEventShortcut } from "@web/shortcuts/hide-event/useHideEventShortcut";
import {
  selectPointerHintSurfaceEligible,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
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
  const { authenticated } = useContext(SessionContext);
  const guestMeetingSetupActive = useSettingsStore(
    selectGuestMeetingSetupActive,
  );
  const { auth: authParam } = useSearch({ from: "__root__" });
  const { isOpen: isAuthModalOpen } = useAuthModalState();
  const signupTrialStepActive =
    authenticated && authParam?.toLowerCase() === VIEW_TO_PARAM.startTrial;
  // The keyboard onboarding overlays paint over MobileGate (they're fixed
  // full-screen), so a phone user would finish the whole walkthrough only to
  // land on "open this on a computer". Gate them up front instead.
  const isMobile = useMemo(() => isMobileOS(), []);
  const isWelcomeGuideOpen = useWelcomeGuideStore(selectWelcomeGuideOpen);
  const isWelcomeFirstVisitOpen = useWelcomeGuideStore(
    selectWelcomeFirstVisitOpen,
  );
  const access = useAppAccess();
  const isCelebrating = useCheckoutCelebrationStore(selectIsCelebrating);
  const isShowcaseActive = useShortcutShowcaseStore(selectShowcaseActive);
  const pointerHintEligible = usePointerHintStore(
    selectPointerHintSurfaceEligible,
  );
  const connectCalendarPromptEligible =
    useConnectCalendarPromptSurfaceEligible(isAuthModalOpen);
  const firstEventPromptEligible =
    useFirstEventPromptSurfaceEligible(isAuthModalOpen);
  useSyncBillingWriteLock();
  usePlanChangeToasts();
  useNavigationShortcuts();
  useCalendarShellShortcuts();
  useFocusNoticeShortcut();
  useEventContextMenuShortcut();
  useHideEventShortcut();
  useGoToDateShortcut();
  // Must stay mounted on every route, including Life, so the 5-minute
  // heads-up still fires while the calendar grid is not on screen.
  useUpcomingEventNotifier();
  // Claims new guest bookings once per load (and on return to the tab
  // after five minutes). No-ops when booking is off or the session is
  // anonymous.
  useNewMeetingsNotice();
  useGuestRsvpNotice();
  useGuestMeetingSetupEntry();
  useGuestMeetingSetupResume();
  useSettingsSearchEntry();
  useDesktopDeepLink();
  useDesktopMenuShortcutBridge();

  const readOnlyStatus =
    access.kind === "server" && access.isReadOnly ? access.status : null;
  // The gate must yield to the celebration. Between Checkout completing and
  // the webhook landing, status can still read awaiting_checkout, and the gate
  // is a full app-lock overlay: it would take the screen at exactly the
  // moment the user has just paid.
  const gateStatus =
    isCelebrating || signupTrialStepActive ? null : readOnlyStatus;
  const showCalendarOnboarding =
    gateStatus === null &&
    !isCelebrating &&
    !deferCalendarOnboarding &&
    !isMobile;
  const showPastDue = access.kind === "server" && access.status === "past_due";

  useEffect(() => {
    if (!showCalendarOnboarding || hasPlayDeepLink()) return;
    if (!hasSeenWelcome()) return;
    shortcutShowcaseActions.resumeIfInProgress();
  }, [showCalendarOnboarding]);

  const onboardingFlags = useMemo((): OnboardingSurfaceFlags => {
    const billingGateClear = gateStatus === null;
    return {
      billingGate: gateStatus !== null,
      checkoutCelebration: isCelebrating,
      welcomeModal: selectWelcomeModalSurfaceEligible(
        showCalendarOnboarding,
        authenticated,
        isWelcomeFirstVisitOpen,
        guestMeetingSetupActive,
      ),
      shortcutShowcase: selectShortcutShowcaseSurfaceEligible(
        showCalendarOnboarding,
        isShowcaseActive,
      ),
      welcomeGuide: selectWelcomeGuideSurfaceEligible(
        billingGateClear,
        isWelcomeGuideOpen,
      ),
      connectCalendarPrompt: billingGateClear && connectCalendarPromptEligible,
      firstEventPrompt: showCalendarOnboarding && firstEventPromptEligible,
      pointerHint: !isLifeView && pointerHintEligible,
    };
  }, [
    gateStatus,
    isCelebrating,
    showCalendarOnboarding,
    authenticated,
    isShowcaseActive,
    isWelcomeGuideOpen,
    isWelcomeFirstVisitOpen,
    guestMeetingSetupActive,
    connectCalendarPromptEligible,
    firstEventPromptEligible,
    isLifeView,
    pointerHintEligible,
  ]);

  const activeOnboardingSurface = selectActiveSurface(onboardingFlags);

  // The gate and the celebration own the screen: the onboarding cards sit at
  // Z_INDEX_TOOLTIP (above Z_INDEX_MODAL), so leaving them mounted would let
  // a gated or celebrating user click straight through and keep touring. They
  // are suppressed rather than living in a second copy of this tree, which
  // keeps Outlet's slot stable — swapping tree shapes remounts the whole
  // calendar.
  return (
    <AuthModalProvider>
      {showPastDue && <BillingPastDueBanner />}
      <Outlet />
      <AuthModal />
      <ConnectAppleForm />
      <MissingPermissionsModal />
      {gateStatus === null && <CheckoutOverlay />}
      {showCalendarOnboarding && <ShowcasePlayLink />}
      {activeOnboardingSurface === "billingGate" && gateStatus !== null && (
        <BillingGateModal status={gateStatus} />
      )}
      {activeOnboardingSurface === "checkoutCelebration" && (
        <CheckoutCelebrationModal />
      )}
      {activeOnboardingSurface === "welcomeModal" && <WelcomeModal />}
      {activeOnboardingSurface === "shortcutShowcase" && <ShortcutShowcase />}
      {activeOnboardingSurface === "welcomeGuide" && <WelcomeGuideModal />}
      {activeOnboardingSurface === "connectCalendarPrompt" && (
        <ConnectCalendarPromptGate />
      )}
      {activeOnboardingSurface === "firstEventPrompt" && <FirstEventPrompt />}
      {activeOnboardingSurface === "pointerHint" && <PointerHint />}
    </AuthModalProvider>
  );
}
