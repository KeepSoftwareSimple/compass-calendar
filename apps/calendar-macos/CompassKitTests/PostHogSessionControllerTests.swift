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
        var sessionCounter = 0
        var controller = PostHogSessionController(
            defaults: defaults,
            generateSessionId: {
                sessionCounter += 1
                return "session-\(sessionCounter)"
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

private final class TestClock {
    private(set) var now: Date

    init(start: Date) {
        now = start
    }

    func advance(by interval: TimeInterval) {
        now = now.addingTimeInterval(interval)
    }
}
