import AppKit
import CompassKit
import CompassUI

@MainActor
final class NativeKeyboardMonitor {
    private let router: NativeGridKeyboardRouter
    private weak var rootView: NSView?
    private var keyboardClock: Task<Void, Never>?
    private var lastTick = ProcessInfo.processInfo.systemUptime
    private var commandIsDown = false

    init(router: NativeGridKeyboardRouter, rootView: NSView) {
        self.router = router
        self.rootView = rootView
    }

    private func owns(_ event: NSEvent) -> Bool {
        guard let window = rootView?.window else { return false }
        return (event.window ?? NSApp.keyWindow) === window && window.attachedSheet == nil
            && !(window.firstResponder is SidebarResizeHandleControl)
    }

    func start() {
        router.dispatcher.pushScope(.grid)
        keyboardClock?.cancel()
        lastTick = ProcessInfo.processInfo.systemUptime
        commandIsDown = false
        keyboardClock = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                guard let self else { return }
                let now = ProcessInfo.processInfo.systemUptime
                let window = rootView?.window
                let isActive = window?.isKeyWindow == true && window?.attachedSheet == nil
                // Reconcile missed flagsChanged events, including a hold begun
                // before this window became key.
                let commandDown = isActive && NSEvent.modifierFlags.contains(.command)
                if commandDown != commandIsDown {
                    commandIsDown = commandDown
                    router.handleCommandStateChanged(commandDown: commandDown)
                }
                router.advanceKeyboardClock(by: now - lastTick, isActive: isActive)
                lastTick = now
            }
        }
    }

    func stop() {
        keyboardClock?.cancel()
        keyboardClock = nil
        commandIsDown = false
        router.advanceKeyboardClock(by: 0, isActive: false)
        router.dispatcher.popScope(.grid)
    }

    deinit { keyboardClock?.cancel() }

    func handleKeyDown(_ event: NSEvent) -> Bool {
        guard owns(event) else { return false }
        return router.handleKeyDown(event)
    }

    func handleFlagsChanged(_ event: NSEvent) {
        guard owns(event) else { return }
        commandIsDown = event.modifierFlags.contains(.command)
        router.handleFlagsChanged(event)
    }

    func handleKeyUp(_ event: NSEvent) {
        guard owns(event) else { return }
        router.handleKeyUp(event)
    }
}
