import AppKit
import CompassData

/// Reports achieved main-window content size for meeting-link wide viewport XCUITest.
@MainActor
final class MainWindowGeometryProbeView: AccessibilityProbeView {
    func publish(target: NSSize, on window: NSWindow) {
        guard UITestLaunchPolicy.meetingLinkWideViewport else {
            isHidden = true
            setAccessibilityElement(false)
            return
        }
        let achieved = window.contentView?.frame.size ?? .zero
        let visible = window.screen?.visibleFrame ?? .zero
        let windowFrame = window.frame
        let targetFrame = window.frameRect(forContentRect: NSRect(origin: .zero, size: target))
        let fitsScreen = targetFrame.width <= visible.width + 2 && targetFrame.height <= visible.height + 2
        let achievedTarget =
            abs(achieved.width - target.width) <= 2 && abs(achieved.height - target.height) <= 2
        let onScreen =
            visible.intersects(windowFrame)
            && windowFrame.width > 0
            && windowFrame.height > 0
            && windowFrame.minX >= visible.minX - 2
            && windowFrame.maxX <= visible.maxX + 2
            && windowFrame.minY >= visible.minY - 2
            && windowFrame.maxY <= visible.maxY + 2
        isHidden = false
        setAccessibilityElement(true)
        setAccessibilityHidden(false)
        setAccessibilityRole(.staticText)
        setAccessibilityIdentifier("compass-native-main-window-geometry")
        setAccessibilityValue(
            "target=\(Int(target.width))x\(Int(target.height));"
                + "achieved=\(Int(achieved.width))x\(Int(achieved.height));"
                + "screen=\(Int(visible.width))x\(Int(visible.height));"
                + "fitsScreen=\(fitsScreen ? 1 : 0);achievedTarget=\(achievedTarget ? 1 : 0);"
                + "onScreen=\(onScreen ? 1 : 0)")
        frame = NSRect(x: 0, y: 0, width: 1, height: 1)
        syncAccessibilityFrame()
        // Avoid window-level layoutChanged here; it can re-enter XCTest full-tree snapshots on wide windows.
        NSAccessibility.post(element: self, notification: .valueChanged)
    }
}

@MainActor
enum MainWindowGeometryProbe {
    private static weak var probe: MainWindowGeometryProbeView?

    @MainActor
    static func publish(target: NSSize, on window: NSWindow?) {
        guard UITestLaunchPolicy.meetingLinkWideViewport, let window, let host = window.contentView else { return }
        probe = AccessibilityProbeView.attach(existing: probe, to: host) {
            MainWindowGeometryProbeView(frame: .zero)
        }
        probe?.publish(target: target, on: window)
    }
}
