import Foundation

/// Device-local onboarding keys; mirrors `STORAGE_KEYS` in `storage.constants.ts`.
public enum OnboardingStorageKeys {
    public static let hasSeenWelcome = "compass.onboarding.has-seen-welcome"
    public static let welcomeExit = "compass.onboarding.welcome-exit"
    public static let firstEventDone = "compass.onboarding.first-event-done"
    public static let connectCalendarPromptSnoozedAt =
        "compass.onboarding.has-dismissed-connect-calendar-prompt"
    public static let pointerHintDismissedPermanently =
        "compass.pointer-hint.dismissed-permanently"
    public static let hasSeenShortcutShowcase =
        "compass.onboarding.has-seen-shortcut-showcase"
    public static let shortcutShowcaseOutcome =
        "compass.onboarding.shortcut-showcase-outcome"
    public static let shortcutShowcaseStep =
        "compass.onboarding.shortcut-showcase-step"
}
