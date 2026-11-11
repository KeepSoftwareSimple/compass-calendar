import Foundation

/// VoiceOver layout notifications for the focused grid card proxy. AppKit mirror
/// probes are UITest-only; production always posts when the proxy is synced.
enum TimeGridFocusedAccessibilityNotifications {
    static func shouldPostLayoutChangedAfterProxySync(
        meetingLinkWideViewport: Bool,
        proxyIsHidden: Bool,
        hasWindow: Bool
    ) -> Bool {
        guard !meetingLinkWideViewport else { return false }
        return hasWindow && !proxyIsHidden
    }
}
