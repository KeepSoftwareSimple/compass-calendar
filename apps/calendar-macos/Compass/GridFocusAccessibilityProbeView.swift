import AppKit

/// VoiceOver helper on the window. XCUITest reads grid focus from
/// `compass-grid-event-focused` on the time grid and the window `value` mirror.
@MainActor
final class GridFocusAccessibilityProbeView: AccessibilityProbeView {
    func update(label: String?) {
        if let label {
            isHidden = false
            setAccessibilityElement(true)
            setAccessibilityHidden(false)
            setAccessibilityRole(.button)
            setAccessibilityLabel(label)
            frame = NSRect(x: 8, y: 8, width: 160, height: 36)
            syncAccessibilityFrame()
        } else {
            isHidden = true
            setAccessibilityElement(false)
            setAccessibilityLabel(nil)
        }
    }
}

@MainActor
enum GridFocusAccessibilityProbe {
    private static weak var probe: GridFocusAccessibilityProbeView?

    static func attach(to window: NSWindow) {
        guard let host = window.contentView else { return }
        attach(to: host)
    }

    static func attach(to hostView: NSView) {
        probe = AccessibilityProbeView.attach(existing: probe, to: hostView) {
            GridFocusAccessibilityProbeView(frame: .zero)
        }
    }

    static func publish(label: String?) {
        if probe == nil, let window = NSApp.keyWindow ?? NSApp.mainWindow {
            attach(to: window)
        }
        guard let probe else { return }
        let wasInactive = probe.isHidden
        let previousLabel = probe.accessibilityLabel() as String?
        probe.update(label: label)
        if label != nil {
            if wasInactive {
                NSAccessibility.post(element: probe, notification: .created)
            }
            NSAccessibility.post(element: probe, notification: .focusedUIElementChanged)
            if previousLabel != label {
                NSAccessibility.post(element: probe, notification: .titleChanged)
            }
        } else if previousLabel != nil {
            NSAccessibility.post(element: probe, notification: .uiElementDestroyed)
        }
        probe.postLayoutChanged()
    }
}
