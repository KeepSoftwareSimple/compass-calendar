import AppKit

/// VoiceOver frame for the focused card. UI tests read `compass-grid-event-focused`
/// from the window-level probe in the Compass app target.
final class FocusedGridEventAccessibilityProxy: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityElement(true)
        setAccessibilityRole(.button)
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
