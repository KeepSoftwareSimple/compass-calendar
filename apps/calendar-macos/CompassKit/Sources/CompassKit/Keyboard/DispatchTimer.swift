import Foundation

public struct DispatchTimerToken: Hashable, Sendable {
    fileprivate let id: UUID
}

/// Injectable timer for leader and hold-modifier engines (tests advance time manually).
public final class DispatchTimer: @unchecked Sendable {
    public typealias FireHandler = @Sendable () -> Void

    private struct Pending {
        let fireAt: TimeInterval
        let handler: FireHandler
    }

    private let lock = NSLock()
    private var now: TimeInterval = 0
    private var pending: [UUID: Pending] = [:]

    public init() {}

    public func schedule(after delay: TimeInterval, handler: @escaping FireHandler) -> DispatchTimerToken {
        let id = UUID()
        lock.lock()
        pending[id] = Pending(fireAt: now + delay, handler: handler)
        lock.unlock()
        return DispatchTimerToken(id: id)
    }

    public func cancel(_ token: DispatchTimerToken) {
        lock.lock()
        pending.removeValue(forKey: token.id)
        lock.unlock()
    }

    public func advance(by interval: TimeInterval) {
        lock.lock()
        now += interval
        let due = pending.filter { $0.value.fireAt <= now }
        for key in due.keys {
            pending.removeValue(forKey: key)
        }
        lock.unlock()
        for entry in due.values {
            entry.handler()
        }
    }

    public func reset() {
        lock.lock()
        now = 0
        pending.removeAll()
        lock.unlock()
    }
}
