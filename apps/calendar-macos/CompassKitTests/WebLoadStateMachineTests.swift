import CompassKit
import XCTest

final class WebLoadStateMachineTests: XCTestCase {
    func testLoadFailureShowsOffline() {
        var machine = WebLoadStateMachine()
        machine.appLoadFailed()
        XCTAssertEqual(machine.phase, .showingOffline)
    }

    func testRetryRequiresNetwork() {
        var machine = WebLoadStateMachine(phase: .showingOffline, networkSatisfied: false)
        machine.retryRequested()
        XCTAssertEqual(machine.phase, .showingOffline)
    }

    func testRetryWhenOnlineStartsLoading() {
        var machine = WebLoadStateMachine(phase: .showingOffline, networkSatisfied: true)
        machine.retryRequested()
        XCTAssertEqual(machine.phase, .loadingApp)
    }

    func testNetworkReturnAutoRetriesFromOffline() {
        var machine = WebLoadStateMachine(phase: .showingOffline, networkSatisfied: false)
        machine.setNetworkSatisfied(true)
        XCTAssertEqual(machine.phase, .loadingApp)
    }

    func testSuccessfulLoadShowsApp() {
        var machine = WebLoadStateMachine(phase: .loadingApp)
        machine.appLoadSucceeded()
        XCTAssertEqual(machine.phase, .showingApp)
    }
}
