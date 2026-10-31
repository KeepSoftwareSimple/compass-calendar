import CompassKit
import XCTest
@testable import CompassData

final class EventDetailsEqualForUndoTests: XCTestCase {
    func testIgnoresColorHexWhenSlotMatches() {
        let left: EventContent = .details(.init(
            color: .blue, colorHex: "#039BE5", description: "", kind: "details", title: "Meet"))
        let right: EventContent = .details(.init(
            color: .blue, description: "", kind: "details", title: "Meet"))
        XCTAssertTrue(EventDetailsEqualForUndo.matches(left, right))
    }
}
