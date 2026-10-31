import Foundation

extension NativeCalendarRootModel {
    /// Web parity: hide bottom-left notices while auth or onboarding is up.
    public var suppressBottomNotices: Bool {
        authStore.isModalPresented
            || activeOnboardingSurface != nil
            || isLifeViewIntroActive
    }
}
