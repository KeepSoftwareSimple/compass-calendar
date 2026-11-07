import AppKit
import CompassData

/// Matches web `event-form-meeting-link-keycaps` after `setViewportSize(1440, 960)`.
enum MeetingLinkWideViewportPolicy {
    private static let contentSize = NSSize(width: 1440, height: 960)

    @MainActor
    static func applyIfNeeded(to window: NSWindow?) {
        guard UITestLaunchPolicy.meetingLinkWideViewport, let window else { return }
        WideViewportUITestTrace.record(
            "policy_apply_begin",
            fields: [
                "hasContentView": window.contentView == nil ? "0" : "1",
                "hasController": window.contentViewController == nil ? "0" : "1",
            ])
        let target = contentSize
        let contentRect = NSRect(origin: .zero, size: target)
        var frame = window.frameRect(forContentRect: contentRect)
        let visible = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? .zero
        let targetFrame = window.frameRect(forContentRect: NSRect(origin: .zero, size: target))
        let fitsScreen = targetFrame.width <= visible.width + 2 && targetFrame.height <= visible.height + 2
        // Intel wide runners often report 1920×959 visible; clamp to hostable content before pinning.
        let maxContent = window.contentRect(
            forFrameRect: NSRect(origin: visible.origin, size: visible.size))
        let appliedContent = NSSize(
            width: min(target.width, maxContent.width),
            height: min(target.height, maxContent.height))
        frame = window.frameRect(forContentRect: NSRect(origin: .zero, size: appliedContent))
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
        window.setAccessibilityIdentifier("Compass")
        window.setFrame(NSRect(origin: origin, size: frame.size), display: true, animate: false)
        window.setContentSize(appliedContent)
        window.contentView?.setFrameSize(appliedContent)
        MainWindowGeometryProbe.publish(target: target, on: window)
        WideViewportUITestTrace.record(
            "policy_apply_end",
            fields: [
                "appliedW": "\(Int(appliedContent.width))",
                "appliedH": "\(Int(appliedContent.height))",
                "visibleW": "\(Int(visible.width))",
                "visibleH": "\(Int(visible.height))",
                "fitsScreen": fitsScreen ? "1" : "0",
            ])
    }

    @MainActor
    static func scheduleReapply(to window: NSWindow?) {
        guard UITestLaunchPolicy.meetingLinkWideViewport, let window else { return }
        WideViewportUITestTrace.record("policy_schedule_reapply")
        applyIfNeeded(to: window)
    }
}
