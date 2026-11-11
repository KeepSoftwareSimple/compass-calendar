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
        guard AccessibilityFrameMath.isValidLayoutRect(frameInParent) else {
            isHidden = true
            return
        }
        isHidden = false
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
        let screenFrame = window.convertToScreen(convert(bounds, to: nil))
        guard AccessibilityFrameMath.isValidScreenRect(screenFrame) else { return }
        setAccessibilityFrame(screenFrame)
    }
}

enum AccessibilityFrameMath {
    static func isValidLayoutRect(_ rect: NSRect) -> Bool {
        rect.origin.x.isFinite
            && rect.origin.y.isFinite
            && rect.width.isFinite
            && rect.height.isFinite
            && rect.width > 1
            && rect.height > 1
    }

    static func isValidScreenRect(_ rect: NSRect) -> Bool {
        rect.origin.x.isFinite
            && rect.origin.y.isFinite
            && rect.width.isFinite
            && rect.height.isFinite
            && rect.width > 0
            && rect.width <= 16_384
            && rect.height > 0
            && rect.height <= 16_384
    }
}
