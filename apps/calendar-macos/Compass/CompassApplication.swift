import AppKit

/// Routes key events through the native keyboard engine before the responder chain.
/// UI tests synthesize key events that may not reach local event monitors.
@MainActor
final class CompassApplication: NSApplication {
    weak var keyboardMonitor: NativeKeyboardMonitor?

    override func sendEvent(_ event: NSEvent) {
        switch event.type {
        case .keyDown:
            if quickAddPanelOwnsKeyboard {
                super.sendEvent(event)
                return
            }
            if keyboardMonitor?.handleKeyDown(event) == true {
                return
            }
        case .flagsChanged:
            keyboardMonitor?.handleFlagsChanged(event)
        case .keyUp:
            keyboardMonitor?.handleKeyUp(event)
        default:
            break
        }
        super.sendEvent(event)
    }

    /// Quick-add uses an AppKit field; grid shortcuts (paste, enter) must not run before the responder chain.
    private var quickAddPanelOwnsKeyboard: Bool {
        NSApp.keyWindow?.accessibilityIdentifier() == "compass-native-quick-add-window"
    }
}
