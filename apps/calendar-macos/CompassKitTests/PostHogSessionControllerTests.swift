import XCTest
@testable import CompassKit

final class PostHogSessionControllerTests: XCTestCase {
    func testTouchSessionIdIsStableWhileActive() {
        let defaults = PostHogAnalyticsDefaultsBox()
        let clock = TestClock(start: Date(timeIntervalSince1970: 1_000))
        var controller = PostHogSessionController(
            defaults: defaults,
            generateSessionId: { "session-1" },
            now: { clock.now })

        XCTAssertEqual(controller.touchSessionId(), "session-1")
        clock.advance(by: 60)
        XCTAssertEqual(controller.touchSessionId(), "session-1")
    }

    func testSessionIdRotatesAfterIdleTimeout() {
        let defaults = PostHogAnalyticsDefaultsBox()
        let clock = TestClock(start: Date(timeIntervalSince1970: 1_000))
        let sessionCounter = LockedBox(0)
        var controller = PostHogSessionController(
            defaults: defaults,
            generateSessionId: {
                sessionCounter.withLock { value in
                    value += 1
                    return "session-\(value)"
                }
            },
            now: { clock.now })

        XCTAssertEqual(controller.touchSessionId(), "session-1")
        clock.advance(by: PostHogSessionController.idleTimeout + 1)
        XCTAssertEqual(controller.touchSessionId(), "session-2")
    }

    func testResetSessionClearsPersistedSession() {
        let defaults = PostHogAnalyticsDefaultsBox()
        var controller = PostHogSessionController(
            defaults: defaults,
            generateSessionId: { "session-1" })
        _ = controller.touchSessionId()
        controller.resetSession()

        var reloaded = PostHogSessionController(
            defaults: defaults,
            generateSessionId: { "session-2" })
        XCTAssertEqual(reloaded.touchSessionId(), "session-2")
    }
}

private final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date

    init(start: Date) {
        current = start
    }

    var now: Date {
        lock.withLock { current }
    }

    func advance(by interval: TimeInterval) {
        lock.withLock { current = current.addingTimeInterval(interval) }
    }
}

private final class LockedBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: T

    init(_ value: T) {
        self.value = value
    }

    func withLock<R>(_ body: (inout T) -> R) -> R {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }
}

private extension NSLock {
    func withLock<R>(_ body: () -> R) -> R {
        lock()
        defer { unlock() }
        return body()
    }
}
