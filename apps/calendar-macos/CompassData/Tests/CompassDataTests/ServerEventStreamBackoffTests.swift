import CompassData
import XCTest

final class ServerEventStreamBackoffTests: XCTestCase {
    func testUsesRetryHintWhenPresent() {
        let config = ServerEventStreamConfiguration()
        let delay = ServerEventStreamBackoff.delay(
            errorCount: 3,
            retryHint: .milliseconds(5000),
            config: config,
            randomUnit: 0.5
        )
        XCTAssertEqual(delay, .milliseconds(5000))
    }

    func testExponentialBackoffWithJitter() {
        let config = ServerEventStreamConfiguration(
            reconnectBase: .seconds(1),
            reconnectMax: .seconds(30)
        )
        let delay = ServerEventStreamBackoff.delay(
            errorCount: 3,
            retryHint: nil,
            config: config,
            randomUnit: 0.5
        )
        XCTAssertEqual(delay, .milliseconds(4000))
    }

    func testStreamLifetimeScheduleConstant() {
        let config = ServerEventStreamConfiguration(streamLifetime: .seconds(20 * 60))
        XCTAssertEqual(config.streamLifetime, .seconds(1200))
    }
}
