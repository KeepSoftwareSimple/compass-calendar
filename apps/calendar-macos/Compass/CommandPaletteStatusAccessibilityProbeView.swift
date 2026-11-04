import AppKit

/// Mirrors web `role="status"` announcements after Go to date navigation.
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

    static func attach(to window: NSWindow) {
        guard let host = window.contentView else { return }
        attach(to: host)
    }

    static func attach(to hostView: NSView) {
        probe = AccessibilityProbeView.attach(existing: probe, to: hostView) {
            CommandPaletteStatusAccessibilityProbeView(frame: .zero)
        }
    }

    static func publish(announcement: String?) {
        if probe == nil, let window = NSApp.keyWindow ?? NSApp.mainWindow {
            attach(to: window)
        }
        guard let probe else { return }
        let wasInactive = probe.isHidden
        let previous = probe.subviews.compactMap { ($0 as? NSTextField)?.stringValue }.first
        probe.update(announcement: announcement)
        guard let announcement, !announcement.isEmpty else {
            if !wasInactive {
                NSAccessibility.post(element: probe, notification: .uiElementDestroyed)
            }
            return
        }
        if wasInactive {
            NSAccessibility.post(element: probe, notification: .created)
        }
        NSAccessibility.post(element: probe, notification: .focusedUIElementChanged)
        if previous != announcement {
            NSAccessibility.post(
                element: probe,
                notification: .announcementRequested,
                userInfo: [.announcement: announcement]
            )
        }
        probe.postLayoutChanged()
    }
}
