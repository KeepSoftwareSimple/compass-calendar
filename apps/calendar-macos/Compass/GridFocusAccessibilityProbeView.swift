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
            frame = NSRect(x: 8, y: 8, width: 160, height: 36)
            if let window, let superview {
                let rectInWindow = convert(bounds, to: nil)
                setAccessibilityFrame(window.convertToScreen(rectInWindow))
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
        if probe == nil, let window = NSApp.keyWindow ?? NSApp.mainWindow {
            let host = window.contentViewController?.view ?? window.contentView
            if let host {
                attach(to: host)
            }
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
