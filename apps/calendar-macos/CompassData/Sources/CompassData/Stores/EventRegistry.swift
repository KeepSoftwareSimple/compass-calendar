// Mirrors `apps/calendar-web/src/grid/interaction/event.registry.ts`.

import CompassKit
import Foundation

public enum ViewInteractionEventType: String, Sendable, Hashable {
    case allDay = "all-day"
    case timed
}

public struct RegisteredEventTarget: Sendable, Hashable {
    public var eventId: EventId
    public var eventType: ViewInteractionEventType
    public var order: Int

    public init(eventId: EventId, eventType: ViewInteractionEventType, order: Int) {
        self.eventId = eventId
        self.eventType = eventType
        self.order = order
    }
}

/// In-memory registry keyed by event type and id (native cards register without DOM).
public final class EventRegistry: @unchecked Sendable {
    private var events: [String: RegisteredEventTarget] = [:]
    private let lock = NSLock()

    public init() {}

    private func registryKey(eventId: EventId, eventType: ViewInteractionEventType) -> String {
        "\(eventType.rawValue):\(eventId.rawValue)"
    }

    public func clear() {
        lock.withLock { events.removeAll() }
    }

    @discardableResult
    public func register(_ target: RegisteredEventTarget) -> () -> Void {
        let key = registryKey(eventId: target.eventId, eventType: target.eventType)
        lock.withLock {
            events[key] = target
        }
        return { [weak self] in
            self?.lock.withLock {
                if self?.events[key]?.order == target.order {
                    self?.events.removeValue(forKey: key)
                }
            }
        }
    }

    public func resolve(eventId: EventId, eventType: ViewInteractionEventType) -> RegisteredEventTarget? {
        lock.withLock {
            events[registryKey(eventId: eventId, eventType: eventType)]
        }
    }

    /// Navigation order: registration order ascending.
    public func navigableTargets() -> [RegisteredEventTarget] {
        lock.withLock {
            events.values.sorted { $0.order < $1.order }
        }
    }
}

private extension NSLock {
    func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}
