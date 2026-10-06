import AppKit
import CompassData

/// XCUITest hook to invoke native undo without relying on synthesized Cmd+Z delivery.
@MainActor
final class UndoTestAccessibilityProbeView: NSView {
    var onUndo: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        isHidden = true
        setAccessibilityElement(true)
        setAccessibilityHidden(false)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Undo last change")
        setAccessibilityIdentifier("compass-native-undo-last-change")
        frame = NSRect(x: 8, y: 52, width: 160, height: 28)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }

    override func accessibilityPerformPress() -> Bool {
        onUndo?()
        return true
    }

    override func accessibilityFrame() -> NSRect {
        guard let window, bounds.width > 0, bounds.height > 0 else {
            return super.accessibilityFrame()
        }
        return window.convertToScreen(convert(bounds, to: nil))
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window else { return }
        setAccessibilityFrame(window.convertToScreen(convert(bounds, to: nil)))
    }
}

@MainActor
enum UndoTestAccessibilityProbe {
    private static weak var probe: UndoTestAccessibilityProbeView?

    static func attachIfNeeded(to window: NSWindow?, model: NativeCalendarRootModel) {
        guard UITestLaunchPolicy.syncGridDraftSave, let host = window?.contentView else { return }
        if let existing = probe, existing.superview === host {
            existing.onUndo = { model.undoKeyboardPlacedCreateNow() }
            return
        }
        probe?.removeFromSuperview()
        let view = UndoTestAccessibilityProbeView(frame: .zero)
        view.onUndo = { model.undoKeyboardPlacedCreateNow() }
        probe = view
        host.addSubview(view)
    }

    static func markUndoReady() {
        guard let probe else { return }
        probe.isHidden = false
        probe.setAccessibilityElement(true)
        probe.setAccessibilityHidden(false)
        probe.setAccessibilityValue("ready")
        probe.setAccessibilityLabel("Undo ready")
        NSAccessibility.post(element: probe, notification: .valueChanged)
        NSAccessibility.post(element: probe, notification: .layoutChanged)
        if let window = probe.window {
            NSAccessibility.post(element: window, notification: .layoutChanged)
        }
    }
}
