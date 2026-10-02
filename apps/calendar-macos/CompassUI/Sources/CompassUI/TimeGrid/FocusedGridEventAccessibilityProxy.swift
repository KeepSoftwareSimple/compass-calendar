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
        syncAccessibilityFrame()
    }

    override func layout() {
        super.layout()
        syncAccessibilityFrame()
    }

    override func accessibilityFrame() -> NSRect {
        guard bounds.width > 1, bounds.height > 1, let window else {
            return super.accessibilityFrame()
        }
        return window.convertToScreen(convert(bounds, to: nil))
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }

    private func syncAccessibilityFrame() {
        guard bounds.width > 1, bounds.height > 1, let window else { return }
        setAccessibilityFrame(window.convertToScreen(convert(bounds, to: nil)))
    }
}
