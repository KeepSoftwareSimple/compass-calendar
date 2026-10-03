import AppKit

/// Routes key events through the native keyboard engine before the responder chain.
/// UI tests synthesize key events that may not reach local event monitors.
@MainActor
final class CompassApplication: NSApplication {
    weak var keyboardMonitor: NativeKeyboardMonitor?

    override func sendEvent(_ event: NSEvent) {
        switch event.type {
        case .keyDown:
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
}
