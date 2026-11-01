import CompassKit
import Foundation

/// Welcome modal actions, shared by the view's buttons and the keyboard router
/// so clicks and keys behave the same, like the web `WelcomeModal`.
extension NativeCalendarRootModel {
    public var isWelcomeModalActive: Bool {
        activeOnboardingSurface == .welcomeModal
    }

    /// Enter: next screen on 1 and 2, trial sign-in on 3 when OAuth is available, calendar on 4.
    public func welcomePrimaryAction() {
        switch onboardingStore.welcomeStep {
        case 1, 2:
            onboardingStore.advanceWelcomeStep()
        case 3:
            if let primary = authStore.welcomeTrialPrimaryProvider() {
                welcomeSignIn(with: primary)
            } else {
                welcomeSignUp()
            }
        default:
            welcomeFinishLocalExplore()
        }
    }

    /// Escape and Back step back one screen; on the first screen they do nothing.
    public func welcomeBack() {
        onboardingStore.retreatWelcomeStep()
    }

    public func welcomeExplore() {
        if onboardingStore.welcomeStep == 3 {
            onboardingStore.advanceWelcomeStep()
            return
        }
        welcomeFinishLocalExplore()
    }

    public func welcomeFinishLocalExplore() {
        exitWelcome(reason: "explore")
        authStore.closeModal()
    }

    public func welcomeLogIn() {
        exitWelcome(reason: "log_in")
        authStore.openModal(.login)
    }

    public func welcomeSignUp() {
        environment.productAnalytics.track(
            .signupStarted,
            properties: ["source": .string("welcome_modal")])
        exitWelcome(reason: "sign_up")
        authStore.openModal(.signUp)
    }

    public func welcomeSignIn(with provider: SignInProviderKind) {
        environment.productAnalytics.track(
            .signupStarted,
            properties: ["source": .string("welcome_modal")])
        exitWelcome(reason: "sign_up_\(provider.rawValue)")
        authStore.signInWithProvider(provider)
    }

    /// Seen-ness lives in UserDefaults, which Observation cannot track, and the
    /// gating keeps the modal up while the first-visit flag is set. Clear the
    /// flag so the modal actually leaves.
    private func exitWelcome(reason: String) {
        onboardingStore.markWelcomeSeen(exit: reason)
        onboardingStore.setWelcomeFirstVisitOpen(false)
    }
}
