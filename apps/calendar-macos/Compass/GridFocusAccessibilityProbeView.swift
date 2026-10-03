import AppKit

/// Window-level focus probe for XCUITest (see `CompassBridgeAccessibility`).
@MainActor
final class GridFocusAccessibilityProbeView: NSView {
    static let identifier = "compass-grid-event-focused"

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isHidden = true
        setAccessibilityElement(false)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func update(label: String?) {
        if let label {
            isHidden = false
            setAccessibilityElement(true)
            setAccessibilityRole(.button)
            setAccessibilityIdentifier(Self.identifier)
            setAccessibilityLabel(label)
            frame = NSRect(x: 0, y: 0, width: 2, height: 2)
            if let window {
                setAccessibilityFrame(window.convertToScreen(convert(bounds, to: nil)))
            }
        } else {
            isHidden = true
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
        guard probe == nil else { return }
        let view = GridFocusAccessibilityProbeView(frame: .zero)
        probe = view
        hostView.addSubview(view, positioned: .above, relativeTo: nil)
    }

    static func publish(label: String?) {
        probe?.update(label: label)
        if let probe, let window = probe.window {
            NSAccessibility.post(element: window, notification: .layoutChanged)
        }
    }
}
