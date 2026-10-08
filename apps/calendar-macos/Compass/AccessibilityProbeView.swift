import AppKit

/// Base for the AppKit mirrors XCUITest reads. SwiftUI overlays, toasts, and
/// text fields are not reliably exposed in CI, so each probe is a clear,
/// non-interactive view that carries the accessibility identifier of the
/// SwiftUI view it mirrors and keeps its screen frame in sync.
@MainActor
class AccessibilityProbeView: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        alphaValue = 1
        isHidden = true
        setAccessibilityElement(false)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// A probe only mirrors state. Clicks belong to the SwiftUI view below it.
    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }

    override func layout() {
        super.layout()
        syncAccessibilityFrame()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        syncAccessibilityFrame()
    }

    override func accessibilityFrame() -> NSRect {
        guard let window, bounds.width > 0, bounds.height > 0 else {
            return super.accessibilityFrame()
        }
        return window.convertToScreen(convert(bounds, to: nil))
    }

    func syncAccessibilityFrame() {
        guard let window, bounds.width > 0, bounds.height > 0 else { return }
        setAccessibilityFrame(window.convertToScreen(convert(bounds, to: nil)))
    }

    /// XCUITest re-reads the tree after a layout change on the probe and on
    /// its window, so both notifications go out together.
    func postLayoutChanged() {
        guard let window else { return }
        NSAccessibility.post(element: self, notification: .layoutChanged)
        NSAccessibility.post(element: window, notification: .layoutChanged)
    }

    /// Reuses the existing probe when it is already on `hostView`; otherwise
    /// replaces it. Overlay, form, and grid-focus probes share this attach.
    static func attach<T: AccessibilityProbeView>(
        existing: T?,
        to hostView: NSView,
        create: () -> T
    ) -> T {
        if let existing, existing.superview === hostView {
            return existing
        }
        existing?.removeFromSuperview()
        let view = create()
        hostView.addSubview(view, positioned: .above, relativeTo: nil)
        return view
    }
}
