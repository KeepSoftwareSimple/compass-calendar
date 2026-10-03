import CompassData
import XCTest

final class EventRepositorySelectionTests: XCTestCase {
    func testNeverAuthenticatedWithoutSessionUsesLocal() {
        XCTAssertEqual(
            EventRepositorySelection.source(sessionExists: false, hasUserEverAuthenticated: false),
            .local)
    }

    func testRememberedAuthUsesRemoteEvenWithoutSession() {
        XCTAssertEqual(
            EventRepositorySelection.source(sessionExists: false, hasUserEverAuthenticated: true),
            .remote)
    }
}
