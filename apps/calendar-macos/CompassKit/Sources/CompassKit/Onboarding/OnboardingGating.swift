import Foundation

/// Pure eligibility rules ported from the web onboarding stores and `RootShell`.
public enum OnboardingGating {
    public static let connectCalendarSnoozeMs: Int64 = 7 * 24 * 60 * 60 * 1000

    public static func hasSeenWelcome(defaults: UserDefaults = .standard) -> Bool {
        defaults.string(forKey: OnboardingStorageKeys.hasSeenWelcome) == "true"
    }

    public static func isConnectCalendarPromptSnoozed(
        nowMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000),
        defaults: UserDefaults = .standard
    ) -> Bool {
        guard let raw = defaults.string(forKey: OnboardingStorageKeys.connectCalendarPromptSnoozedAt),
              !raw.isEmpty
        else { return false }
        guard let snoozedAt = Int64(raw) else { return false }
        return nowMs - snoozedAt < connectCalendarSnoozeMs
    }

    public static func firstEventDoneReason(defaults: UserDefaults = .standard) -> String? {
        let value = defaults.string(forKey: OnboardingStorageKeys.firstEventDone)
        if value == "completed" || value == "dismissed" { return value }
        return nil
    }

    public static func pointerHintDismissedPermanently(defaults: UserDefaults = .standard) -> Bool {
        defaults.string(forKey: OnboardingStorageKeys.pointerHintDismissedPermanently) == "true"
    }

    public static func selectWelcomeModalSurfaceEligible(
        showCalendarOnboarding: Bool,
        authenticated: Bool,
        isFirstVisitOpen: Bool,
        guestMeetingSetupActive: Bool
    ) -> Bool {
        guard showCalendarOnboarding else { return false }
        guard !authenticated else { return false }
        guard !guestMeetingSetupActive else { return false }
        if !hasSeenWelcome() { return true }
        return isFirstVisitOpen
    }

    public static func selectWelcomeGuideSurfaceEligible(
        billingGateClear: Bool,
        isOpen: Bool
    ) -> Bool {
        billingGateClear && isOpen
    }

    public static func selectShortcutShowcaseSurfaceEligible(
        showCalendarOnboarding: Bool,
        showcaseActive: Bool
    ) -> Bool {
        showCalendarOnboarding && showcaseActive
    }

    public static func selectFirstEventPromptSurfaceEligible(
        isAuthModalOpen: Bool,
        isSettingsOpen: Bool,
        isAboutOpen: Bool,
        isFormOpen: Bool,
        isDone: Bool,
        storageAvailable: Bool,
        showcaseActive: Bool
    ) -> Bool {
        !isAuthModalOpen &&
            !isSettingsOpen &&
            !isAboutOpen &&
            !isFormOpen &&
            !isDone &&
            storageAvailable &&
            !showcaseActive
    }

    public static func selectConnectCalendarPromptSurfaceEligible(
        authenticated: Bool,
        metadataLoaded: Bool,
        connectionCount: Int,
        isSnoozed: Bool,
        availableProviderCount: Int,
        storageAvailable: Bool,
        isAuthModalOpen: Bool,
        isSettingsOpen: Bool,
        isAboutOpen: Bool,
        isAppleFormOpen: Bool,
        isMissingPermissionsOpen: Bool
    ) -> Bool {
        authenticated &&
            metadataLoaded &&
            connectionCount == 0 &&
            !isSnoozed &&
            availableProviderCount > 0 &&
            storageAvailable &&
            !isAuthModalOpen &&
            !isSettingsOpen &&
            !isAboutOpen &&
            !isAppleFormOpen &&
            !isMissingPermissionsOpen
    }

    public static func selectPointerHintSurfaceEligible(
        pointerHintVisible: Bool,
        defaults: UserDefaults = .standard
    ) -> Bool {
        pointerHintVisible && !pointerHintDismissedPermanently(defaults: defaults)
    }

    public struct ActiveSurfaceInput: Sendable {
        public var gateStatus: SubscriptionStatusEnum?
        public var isCheckoutCelebrating: Bool
        public var showCalendarOnboarding: Bool
        public var authenticated: Bool
        public var isWelcomeFirstVisitOpen: Bool
        public var isWelcomeGuideOpen: Bool
        public var guestMeetingSetupActive: Bool
        public var shortcutShowcaseActive: Bool
        public var connectCalendarEligible: Bool
        public var firstEventEligible: Bool
        public var pointerHintVisible: Bool
        public var isLifeView: Bool
        public var defaults: UserDefaults

        public init(
            gateStatus: SubscriptionStatusEnum?,
            isCheckoutCelebrating: Bool,
            showCalendarOnboarding: Bool,
            authenticated: Bool,
            isWelcomeFirstVisitOpen: Bool,
            isWelcomeGuideOpen: Bool,
            guestMeetingSetupActive: Bool,
            shortcutShowcaseActive: Bool,
            connectCalendarEligible: Bool,
            firstEventEligible: Bool,
            pointerHintVisible: Bool,
            isLifeView: Bool,
            defaults: UserDefaults = .standard
        ) {
            self.gateStatus = gateStatus
            self.isCheckoutCelebrating = isCheckoutCelebrating
            self.showCalendarOnboarding = showCalendarOnboarding
            self.authenticated = authenticated
            self.isWelcomeFirstVisitOpen = isWelcomeFirstVisitOpen
            self.isWelcomeGuideOpen = isWelcomeGuideOpen
            self.guestMeetingSetupActive = guestMeetingSetupActive
            self.shortcutShowcaseActive = shortcutShowcaseActive
            self.connectCalendarEligible = connectCalendarEligible
            self.firstEventEligible = firstEventEligible
            self.pointerHintVisible = pointerHintVisible
            self.isLifeView = isLifeView
            self.defaults = defaults
        }
    }

    public static func buildSurfaceFlags(_ input: ActiveSurfaceInput) -> OnboardingSurfaceFlags {
        let billingGateClear = input.gateStatus == nil
        let welcomeModal = selectWelcomeModalSurfaceEligible(
            showCalendarOnboarding: input.showCalendarOnboarding,
            authenticated: input.authenticated,
            isFirstVisitOpen: input.isWelcomeFirstVisitOpen,
            guestMeetingSetupActive: input.guestMeetingSetupActive)
        let connectCalendar = billingGateClear && input.connectCalendarEligible
        let firstEvent = input.showCalendarOnboarding && input.firstEventEligible
        let pointerHint = !input.isLifeView && selectPointerHintSurfaceEligible(
            pointerHintVisible: input.pointerHintVisible,
            defaults: input.defaults)

        return [
            .billingGate: input.gateStatus != nil,
            .checkoutCelebration: input.isCheckoutCelebrating,
            .welcomeModal: welcomeModal,
            .shortcutShowcase: selectShortcutShowcaseSurfaceEligible(
                showCalendarOnboarding: input.showCalendarOnboarding,
                showcaseActive: input.shortcutShowcaseActive),
            .welcomeGuide: selectWelcomeGuideSurfaceEligible(
                billingGateClear: billingGateClear,
                isOpen: input.isWelcomeGuideOpen),
            .connectCalendarPrompt: connectCalendar,
            .firstEventPrompt: firstEvent,
            .pointerHint: pointerHint,
        ]
    }

    public static func selectActiveSurface(_ input: ActiveSurfaceInput) -> OnboardingSurfaceKind? {
        OnboardingSurfaceSelection.selectActiveSurface(buildSurfaceFlags(input))
    }
}
