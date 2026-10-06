import AppKit

/// AppKit mirror of the recurrence scope dialog for XCUITest. SwiftUI overlays are
/// not reliably exposed in CI; this probe uses the same identifier as `RecurrenceScopeDialogView`.
@MainActor
final class RecurrenceScopeAccessibilityProbeView: NSView {
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
            setAccessibilityIdentifier("compass-recurrence-scope-dialog")
            setAccessibilityRole(.group)
            setAccessibilityLabel("Save recurring event")
            frame = NSRect(x: 120, y: 120, width: 200, height: 120)
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
enum RecurrenceScopeAccessibilityProbe {
    private static weak var probe: RecurrenceScopeAccessibilityProbeView?

    static func attach(to window: NSWindow) {
        guard let host = window.contentView else { return }
        attach(to: host)
    }

    static func attach(to hostView: NSView) {
        if let existing = probe, existing.superview === hostView {
            return
        }
        probe?.removeFromSuperview()
        let view = RecurrenceScopeAccessibilityProbeView(frame: .zero)
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
        }
        if let window = probe.window {
            NSAccessibility.post(element: probe, notification: .layoutChanged)
            NSAccessibility.post(element: window, notification: .layoutChanged)
        }
    }
}
