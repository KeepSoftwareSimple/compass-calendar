import AppKit
import CompassKit

@MainActor
final class NativeKeyboardMonitor {
    private let dispatcher: ShortcutDispatcher
    private let contextProvider: () -> ShortcutContext
    private let viewSwitchIds: Set<ShortcutId>
    private var keyDownMonitor: Any?
    private var keyUpMonitor: Any?

    init(
        dispatcher: ShortcutDispatcher,
        contextProvider: @escaping () -> ShortcutContext,
        viewSwitchIds: Set<ShortcutId> = []
    ) {
        self.dispatcher = dispatcher
        self.contextProvider = contextProvider
        self.viewSwitchIds = viewSwitchIds
    }

    func start() {
        dispatcher.pushScope(.grid)
        keyDownMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            dispatcher.shortcutContext = contextProvider()
            guard let keyEvent = KeyEvent(nsEvent: event) else { return event }
            if let id = dispatcher.dispatch(keyEvent), !viewSwitchIds.contains(id) {
                return nil
            }
            return event
        }
        keyUpMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyUp) { [weak self] event in
            guard let self else { return event }
            dispatcher.shortcutContext = contextProvider()
            guard let keyEvent = KeyEvent(nsEvent: event) else { return event }
            if dispatcher.dispatch(keyEvent) != nil {
                return nil
            }
            return event
        }
    }

    func stop() {
        if let keyDownMonitor {
            NSEvent.removeMonitor(keyDownMonitor)
        }
        if let keyUpMonitor {
            NSEvent.removeMonitor(keyUpMonitor)
        }
        keyDownMonitor = nil
        keyUpMonitor = nil
    }
}
