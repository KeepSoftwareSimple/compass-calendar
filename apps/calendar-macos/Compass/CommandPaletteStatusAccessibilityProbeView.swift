import AppKit
import CompassData

/// Mirrors web `role="status"` for XCUITest and posts spoken status on the host window.
@MainActor
final class CommandPaletteStatusAccessibilityProbeView: AccessibilityProbeView {
    private let labelField = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        labelField.setAccessibilityElement(true)
        labelField.setAccessibilityRole(.staticText)
        addSubview(labelField)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func update(announcement: String?) {
        if let announcement, !announcement.isEmpty {
            isHidden = false
            setAccessibilityElement(true)
            setAccessibilityHidden(false)
            setAccessibilityIdentifier("compass-native-command-palette-status")
            setAccessibilityRole(.group)
            setAccessibilityLabel("Status")
            labelField.stringValue = announcement
            labelField.setAccessibilityIdentifier("compass-native-command-palette-status-announcement")
            labelField.setAccessibilityLabel(announcement)
            labelField.frame = NSRect(x: 0, y: 0, width: max(240, labelField.intrinsicContentSize.width + 8), height: 22)
            frame = labelField.frame
            syncAccessibilityFrame()
            setAccessibilityChildren([labelField])
        } else {
            isHidden = true
            setAccessibilityElement(false)
            setAccessibilityIdentifier(nil)
            setAccessibilityLabel(nil)
            labelField.stringValue = ""
            labelField.setAccessibilityIdentifier(nil)
            labelField.setAccessibilityLabel(nil)
        }
    }
}

@MainActor
enum CommandPaletteStatusAccessibilityProbe {
    private static weak var probe: CommandPaletteStatusAccessibilityProbeView?

    /// When true, `publish` records host-window announcement posts instead of calling AppKit.
    /// Used by CompassKitTests to guard the production path when probes stay detached.
    static var interceptAnnouncementPostForTesting = false

    static private(set) var interceptedAnnouncementPostsForTesting: [
        (hostWindowID: ObjectIdentifier, notification: NSAccessibility.Notification, announcement: String)
    ] = []

    static func resetAnnouncementPostInterceptForTesting() {
        interceptAnnouncementPostForTesting = false
        interceptedAnnouncementPostsForTesting = []
    }

    static func attach(to window: NSWindow) {
        guard let host = window.contentView else { return }
        attach(to: host)
    }

    static func attach(to hostView: NSView) {
        probe = AccessibilityProbeView.attach(existing: probe, to: hostView) {
            CommandPaletteStatusAccessibilityProbeView(frame: .zero)
        }
    }

    static func publish(announcement: String?, hostWindow: NSWindow? = nil) {
        let window = hostWindow ?? NSApp.keyWindow ?? NSApp.mainWindow
        let delivery = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: announcement,
            attachesAccessibilityProbes: UITestLaunchPolicy.attachesAccessibilityProbes
        )

        if UITestLaunchPolicy.attachesMirroredAccessibilityProbes, let host = window?.contentView {
            syncProbeMirror(delivery: delivery, hostView: host)
        }

        if case .speak(let payload, _) = delivery, let window {
            postAnnouncementRequested(on: window, payload: payload)
        }
    }

    private static func postAnnouncementRequested(on window: NSWindow, payload: String) {
        if interceptAnnouncementPostForTesting {
            interceptedAnnouncementPostsForTesting.append(
                (ObjectIdentifier(window), .announcementRequested, payload)
            )
            return
        }
        NSAccessibility.post(
            element: window,
            notification: .announcementRequested,
            userInfo: [.announcement: payload]
        )
    }

    private static func syncProbeMirror(
        delivery: CommandPaletteStatusAnnouncementDelivery,
        hostView: NSView
    ) {
        if probe == nil {
            attach(to: hostView)
        }
        guard let probe else { return }
        let wasInactive = probe.isHidden
        switch delivery {
        case .clear:
            probe.update(announcement: nil)
            if !wasInactive {
                NSAccessibility.post(element: probe, notification: .uiElementDestroyed)
            }
        case .speak(_, let mirror):
            guard let mirror else { return }
            probe.update(announcement: mirror)
            if wasInactive {
                NSAccessibility.post(element: probe, notification: .created)
            }
        }
        probe.postLayoutChanged()
    }
}
