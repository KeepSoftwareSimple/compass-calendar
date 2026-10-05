import AppKit

/// AppKit mirror of the event form title field for XCUITest. SwiftUI text fields are
/// not reliably exposed in CI; this probe uses the same identifier as `EventFormView`.
@MainActor
final class EventFormAccessibilityProbeView: NSView {

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

    func update(visible: Bool) {
        if visible {
            isHidden = false
            setAccessibilityElement(true)
            setAccessibilityHidden(false)
            setAccessibilityIdentifier("compass-event-form-title")
            setAccessibilityRole(.textField)
            setAccessibilityLabel("Title")
            frame = NSRect(x: 200, y: 200, width: 160, height: 36)
            syncAccessibilityFrame()
        } else {
            isHidden = true
            setAccessibilityElement(false)
            setAccessibilityIdentifier(nil)
            setAccessibilityLabel(nil)
        }
    }

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

    private func syncAccessibilityFrame() {
        guard let window, bounds.width > 0, bounds.height > 0 else { return }
        setAccessibilityFrame(window.convertToScreen(convert(bounds, to: nil)))
    }
}

@MainActor
enum EventFormAccessibilityProbe {
    private static weak var probe: EventFormAccessibilityProbeView?

    static func attach(to window: NSWindow) {
        guard let host = window.contentView else { return }
        attach(to: host)
    }

    static func attach(to hostView: NSView) {
        if let existing = probe, existing.superview === hostView {
            return
        }
        probe?.removeFromSuperview()
        let view = EventFormAccessibilityProbeView(frame: .zero)
        probe = view
        hostView.addSubview(view, positioned: .above, relativeTo: nil)
    }

    static func publish(visible: Bool) {
        if probe == nil, let window = NSApp.keyWindow ?? NSApp.mainWindow {
            attach(to: window)
        }
        guard let probe else { return }
        let wasInactive = probe.isHidden
        probe.update(visible: visible)
        if visible {
            if wasInactive {
                NSAccessibility.post(element: probe, notification: .created)
            }
            NSAccessibility.post(element: probe, notification: .focusedUIElementChanged)
            NSAccessibility.post(element: probe, notification: .titleChanged)
        }
        if let window = probe.window {
            NSAccessibility.post(element: probe, notification: .layoutChanged)
            NSAccessibility.post(element: window, notification: .layoutChanged)
        }
    }
}
