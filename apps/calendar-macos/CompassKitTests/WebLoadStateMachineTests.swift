import CompassKit
import XCTest

final class WebLoadStateMachineTests: XCTestCase {
    func testLoadFailureShowsOfflinePage() {
        var machine = WebLoadStateMachine()
        let actions = machine.handle(.appLoadFailed)
        XCTAssertEqual(actions, [.showOfflinePage])
        XCTAssertEqual(machine.presentation, .offline)
    }

    func testSuccessfulLoadAfterOfflineClearsOfflineState() {
        var machine = WebLoadStateMachine(presentation: .offline)
        XCTAssertEqual(machine.handle(.appLoadSucceeded), [])
        XCTAssertEqual(machine.presentation, .app)
    }

    func testRetryWhileOfflineLoadsAppURL() {
        var machine = WebLoadStateMachine(presentation: .offline)
        XCTAssertEqual(machine.handle(.userRequestedRetry), [.loadAppURL])
        XCTAssertEqual(machine.presentation, .offline)
    }

    func testNetworkReturnWhileOfflineLoadsAppURL() {
        var machine = WebLoadStateMachine(presentation: .offline)
        XCTAssertEqual(machine.handle(.networkBecameReachable), [.loadAppURL])
    }

    func testIgnoredEventsWhileOnline() {
        var machine = WebLoadStateMachine()
        XCTAssertEqual(machine.handle(.networkBecameReachable), [])
        XCTAssertEqual(machine.handle(.userRequestedRetry), [.loadAppURL])
    }
}
