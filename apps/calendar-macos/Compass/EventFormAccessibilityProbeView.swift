import AppKit

/// AppKit mirror of the event form title field for XCUITest. SwiftUI text fields are
/// not reliably exposed in CI; this probe uses the same identifier as `EventFormView`.
@MainActor
final class EventFormAccessibilityProbeView: AccessibilityProbeView {
    private var titleBuffer = ""
    var onTitleChanged: ((String) -> Void)?

    override var acceptsFirstResponder: Bool {
        !isHidden
    }

    func update(visible: Bool, title: String?) {
        if visible {
            titleBuffer = title ?? ""
            isHidden = false
            setAccessibilityElement(true)
            setAccessibilityHidden(false)
            setAccessibilityIdentifier("compass-event-form-title")
            setAccessibilityRole(.textField)
            setAccessibilityLabel("Title")
            setAccessibilityValue(titleBuffer)
            frame = NSRect(x: 200, y: 200, width: 160, height: 36)
            syncAccessibilityFrame()
        } else {
            isHidden = true
            titleBuffer = ""
            setAccessibilityElement(false)
            setAccessibilityIdentifier(nil)
            setAccessibilityLabel(nil)
            setAccessibilityValue(nil)
        }
    }

    override func keyDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command),
            event.charactersIgnoringModifiers?.lowercased() == "v"
        {
            if let string = NSPasteboard.general.string(forType: .string) {
                titleBuffer = string
                publishTitle()
            }
            return
        }
        if event.modifierFlags.contains(.command),
            event.charactersIgnoringModifiers?.lowercased() == "a"
        {
            titleBuffer = ""
            publishTitle()
            return
        }
        if !event.modifierFlags.intersection([.command, .control, .option]).isEmpty {
            super.keyDown(with: event)
            return
        }
        guard let characters = event.characters, !characters.isEmpty else {
            super.keyDown(with: event)
            return
        }
        if event.keyCode == 36 || event.keyCode == 76 {
            return
        }
        titleBuffer += characters
        publishTitle()
    }

    func syncTitle(_ title: String?) {
        guard !isHidden else { return }
        titleBuffer = title ?? ""
        setAccessibilityValue(titleBuffer)
    }

    private func publishTitle() {
        setAccessibilityValue(titleBuffer)
        onTitleChanged?(titleBuffer)
        NSAccessibility.post(element: self, notification: .valueChanged)
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
        probe = AccessibilityProbeView.attach(existing: probe, to: hostView) {
            EventFormAccessibilityProbeView(frame: .zero)
        }
    }

    static func syncTitle(_ title: String?) {
        probe?.syncTitle(title)
    }

    static func publish(visible: Bool, title: String? = nil, onTitleChanged: ((String) -> Void)? = nil) {
        if probe == nil, let window = NSApp.keyWindow ?? NSApp.mainWindow {
            attach(to: window)
        }
        guard let probe else { return }
        probe.onTitleChanged = onTitleChanged
        let wasInactive = probe.isHidden
        probe.update(visible: visible, title: title)
        if visible {
            if wasInactive {
                NSAccessibility.post(element: probe, notification: .created)
            }
            NSAccessibility.post(element: probe, notification: .focusedUIElementChanged)
            NSAccessibility.post(element: probe, notification: .titleChanged)
            if wasInactive, let window = probe.window {
                window.makeFirstResponder(probe)
            }
        }
        probe.postLayoutChanged()
    }
}
