import AppKit
import CompassData

/// Matches web `event-form-meeting-link-keycaps` after `setViewportSize(1440, 960)`.
enum MeetingLinkWideViewportPolicy {
    private static let contentSize = NSSize(width: 1440, height: 960)

    @MainActor
    static func applyIfNeeded(to window: NSWindow?) {
        guard UITestLaunchPolicy.meetingLinkWideViewport, let window else { return }
        let target = contentSize
        let contentRect = NSRect(origin: .zero, size: target)
        let frame = window.frameRect(forContentRect: contentRect)
        window.minSize = frame.size
        window.maxSize = frame.size
        let visible = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame
        var origin = frame.origin
        if let visible {
            origin.x = max(visible.minX, min(visible.maxX - frame.width, visible.midX - frame.width / 2))
            origin.y = max(visible.minY, visible.maxY - frame.height)
        }
        window.setFrame(NSRect(origin: origin, size: frame.size), display: true, animate: false)
        window.setContentSize(target)
        window.contentView?.setFrameSize(target)
    }

    @MainActor
    static func scheduleReapply(to window: NSWindow?) {
        guard UITestLaunchPolicy.meetingLinkWideViewport, window != nil else { return }
        applyIfNeeded(to: window)
        DispatchQueue.main.async {
            applyIfNeeded(to: window)
        }
    }
}
