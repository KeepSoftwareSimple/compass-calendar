import AppKit
import CompassKit

@MainActor
final class NativeKeyboardMonitor {
    private let dispatcher: ShortcutDispatcher
    private var monitor: Any?

    init(dispatcher: ShortcutDispatcher) {
        self.dispatcher = dispatcher
    }

    func start() {
        dispatcher.pushScope(.grid)
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            guard let keyEvent = KeyEvent(nsEvent: event) else { return event }
            if dispatcher.dispatch(keyEvent) != nil {
                return nil
            }
            return event
        }
    }

    func stop() {
        if let monitor {
            NSEvent.removeMonitor(monitor)
        }
        monitor = nil
    }
}
