import AppKit

/// VoiceOver helper on the window. XCUITest reads grid focus from
/// `compass-grid-event-focused` on the time grid and the window `value` mirror.
@MainActor
final class GridFocusAccessibilityProbeView: NSView {

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

    func update(label: String?) {
        if let label {
            isHidden = false
            setAccessibilityElement(true)
            setAccessibilityHidden(false)
            setAccessibilityRole(.button)
            setAccessibilityLabel(label)
            frame = NSRect(x: 8, y: 8, width: 160, height: 36)
            syncAccessibilityFrame()
        } else {
            isHidden = true
            setAccessibilityElement(false)
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
enum GridFocusAccessibilityProbe {
    private static weak var probe: GridFocusAccessibilityProbeView?

    static func attach(to window: NSWindow) {
        guard let host = window.contentView else { return }
        attach(to: host)
    }

    static func attach(to hostView: NSView) {
        if let existing = probe, existing.superview === hostView {
            return
        }
        probe?.removeFromSuperview()
        let view = GridFocusAccessibilityProbeView(frame: .zero)
        probe = view
        hostView.addSubview(view, positioned: .above, relativeTo: nil)
    }

    static func publish(label: String?) {
        if probe == nil, let window = NSApp.keyWindow ?? NSApp.mainWindow {
            attach(to: window)
        }
        guard let probe else { return }
        let wasInactive = probe.isHidden
        let previousLabel = probe.accessibilityLabel() as String?
        probe.update(label: label)
        if label != nil {
            if wasInactive {
                NSAccessibility.post(element: probe, notification: .created)
            }
            NSAccessibility.post(element: probe, notification: .focusedUIElementChanged)
            if previousLabel != label {
                NSAccessibility.post(element: probe, notification: .titleChanged)
            }
        } else if previousLabel != nil {
            NSAccessibility.post(element: probe, notification: .uiElementDestroyed)
        }
        if let window = probe.window {
            NSAccessibility.post(element: probe, notification: .layoutChanged)
            NSAccessibility.post(element: window, notification: .layoutChanged)
        }
    }
}
