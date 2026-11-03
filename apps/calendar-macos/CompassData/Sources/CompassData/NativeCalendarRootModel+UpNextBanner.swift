import Foundation

extension NativeCalendarRootModel {
    /// Web parity: hide the centered up-next banner during auth or blocking onboarding.
    public var suppressUpNextBanner: Bool {
        authStore.isModalPresented
            || activeOnboardingSurface == .welcomeModal
            || activeOnboardingSurface == .shortcutShowcase
    }
}
