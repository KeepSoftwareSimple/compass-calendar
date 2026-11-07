import AppKit
import CompassData

/// Matches web `event-form-meeting-link-keycaps` after `setViewportSize(1440, 960)`.
enum MeetingLinkWideViewportPolicy {
    private static let contentSize = NSSize(width: 1440, height: 960)

    @MainActor
    static func applyIfNeeded(to window: NSWindow?) {
        guard UITestLaunchPolicy.meetingLinkWideViewport, let window else { return }
        let target = contentSize
        MainWindowGeometryProbe.publishWindowMirror(target: target, on: window)
        let contentRect = NSRect(origin: .zero, size: target)
        var frame = window.frameRect(forContentRect: contentRect)
        let visible = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? .zero
        let fitsScreen = frame.width <= visible.width + 2 && frame.height <= visible.height + 2
        var appliedContent = target
        if !fitsScreen {
            // Do not pin an oversized min/max when the runner display is smaller than web's 1440×960.
            let maxContent = window.contentRect(
                forFrameRect: NSRect(
                    origin: .zero,
                    size: NSSize(width: max(visible.width, 1), height: max(visible.height, 1))))
            appliedContent = NSSize(
                width: min(target.width, maxContent.size.width),
                height: min(target.height, maxContent.size.height))
            frame = window.frameRect(forContentRect: NSRect(origin: .zero, size: appliedContent))
        }
        var origin = frame.origin
        if visible.width > 0, visible.height > 0 {
            origin.x = max(visible.minX, min(visible.maxX - frame.width, visible.midX - frame.width / 2))
            origin.y = max(visible.minY, visible.maxY - frame.height)
        }
        if fitsScreen {
            window.minSize = frame.size
            window.maxSize = frame.size
        } else {
            window.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        }
        window.setFrame(NSRect(origin: origin, size: frame.size), display: true, animate: false)
        window.setContentSize(appliedContent)
        window.contentView?.setFrameSize(appliedContent)
        MainWindowGeometryProbe.publish(target: target, on: window)
    }

    @MainActor
    static func scheduleReapply(to window: NSWindow?) {
        guard UITestLaunchPolicy.meetingLinkWideViewport, let window else { return }
        applyIfNeeded(to: window)
    }
}
