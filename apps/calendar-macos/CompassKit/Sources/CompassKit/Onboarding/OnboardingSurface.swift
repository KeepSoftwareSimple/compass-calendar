import Foundation

/// Ordered onboarding/teaching surfaces; highest priority first.
/// Mirrors `ONBOARDING_SURFACE_PRIORITY` in `onboarding-surface.ts`.
public enum OnboardingSurfaceKind: String, CaseIterable, Sendable {
    case billingGate
    case checkoutCelebration
    case welcomeModal
    case shortcutShowcase
    case welcomeGuide
    case connectCalendarPrompt
    case firstEventPrompt
    case pointerHint
}

public typealias OnboardingSurfaceFlags = [OnboardingSurfaceKind: Bool]

public enum OnboardingSurfaceSelection {
    /// Returns the highest-priority surface that wants the screen, or nil.
    public static func selectActiveSurface(_ flags: OnboardingSurfaceFlags) -> OnboardingSurfaceKind? {
        for kind in OnboardingSurfaceKind.allCases {
            if flags[kind] == true { return kind }
        }
        return nil
    }
}
