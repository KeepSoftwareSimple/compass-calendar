import AppKit

/// Window-level focus probe for XCUITest (see `CompassBridgeAccessibility`).
@MainActor
final class GridFocusAccessibilityProbeView: NSView {
    static let identifier = "compass-grid-event-focused"

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        alphaValue = 0
        setAccessibilityHidden(true)
        setAccessibilityElement(false)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func update(label: String?) {
        if let label {
            alphaValue = 0.01
            setAccessibilityHidden(false)
            setAccessibilityElement(true)
            setAccessibilityRole(.button)
            setAccessibilityIdentifier(Self.identifier)
            setAccessibilityLabel(label)
            frame = NSRect(x: 0, y: 0, width: 4, height: 4)
            if let window {
                setAccessibilityFrame(window.convertToScreen(convert(bounds, to: nil)))
            }
        } else {
            alphaValue = 0
            setAccessibilityHidden(true)
            setAccessibilityElement(false)
            setAccessibilityLabel(nil)
        }
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }
}

@MainActor
enum GridFocusAccessibilityProbe {
    private static weak var probe: GridFocusAccessibilityProbeView?

    static func attach(to hostView: NSView) {
        let view: GridFocusAccessibilityProbeView
        if let existing = probe, existing.superview === hostView {
            return
        }
        probe?.removeFromSuperview()
        view = GridFocusAccessibilityProbeView(frame: .zero)
        probe = view
        hostView.addSubview(view, positioned: .above, relativeTo: nil)
    }

    static func publish(label: String?) {
        if probe == nil, let contentView = NSApp.mainWindow?.contentView {
            attach(to: contentView)
        }
        guard let probe else { return }
        let wasHidden = !probe.isAccessibilityElement()
        probe.update(label: label)
        if label != nil {
            if wasHidden {
                NSAccessibility.post(element: probe, notification: .created)
            }
            NSAccessibility.post(element: probe, notification: .focusedUIElementChanged)
        }
        if let window = probe.window {
            NSAccessibility.post(element: probe, notification: .layoutChanged)
            NSAccessibility.post(element: window, notification: .layoutChanged)
        }
    }
}
