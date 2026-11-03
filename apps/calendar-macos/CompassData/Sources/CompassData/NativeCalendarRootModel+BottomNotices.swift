import Foundation

extension NativeCalendarRootModel {
    /// Web parity: hide bottom-left notices during auth or blocking onboarding modals.
    public var suppressBottomNotices: Bool {
        authStore.isModalPresented
            || activeOnboardingSurface == .welcomeModal
            || activeOnboardingSurface == .shortcutShowcase
    }
}
