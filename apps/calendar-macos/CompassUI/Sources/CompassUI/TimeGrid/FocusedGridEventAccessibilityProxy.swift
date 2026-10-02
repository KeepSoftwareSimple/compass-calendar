import AppKit

/// XCUITest reads stable accessibility elements more reliably than mutating
/// `accessibilityIdentifier` on the event card itself (see CompassBridgeAccessibility).
final class FocusedGridEventAccessibilityProxy: NSView {
    static let identifier = "compass-grid-event-focused"

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityElement(true)
        setAccessibilityRole(.button)
        setAccessibilityIdentifier(Self.identifier)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func sync(label: String, frameInParent: NSRect) {
        frame = frameInParent
        setAccessibilityLabel(label)
        layoutSubtreeIfNeeded()
        if bounds.width > 1, bounds.height > 1, let window {
            setAccessibilityFrame(window.convertToScreen(convert(bounds, to: nil)))
        }
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }
}
