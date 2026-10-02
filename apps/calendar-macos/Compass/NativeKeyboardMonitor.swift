import AppKit
import CompassKit

@MainActor
final class NativeKeyboardMonitor {
    private let router: NativeGridKeyboardRouter
    init(router: NativeGridKeyboardRouter) {
        self.router = router
    }

    func start() {
        router.dispatcher.pushScope(.grid)
    }

    func stop() {
        router.dispatcher.popScope(.grid)
    }

    func handleKeyDown(_ event: NSEvent) -> Bool {
        router.handleKeyDown(event)
    }

    func handleFlagsChanged(_ event: NSEvent) {
        router.handleFlagsChanged(event)
    }

    func handleKeyUp(_ event: NSEvent) {
        router.handleKeyUp(event)
    }
}
