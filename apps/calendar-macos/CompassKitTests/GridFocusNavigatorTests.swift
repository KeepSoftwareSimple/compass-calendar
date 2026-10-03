import CompassKit
import XCTest

final class GridFocusNavigatorTests: XCTestCase {
    func testVerticalAdjacentMovesToNextTimedEvent() {
        let lower = FocusLayoutCard(
            eventId: "a",
            frame: EventPosition(height: 40, left: 100, top: 120, width: 80),
            isAllDay: false
        )
        let upper = FocusLayoutCard(
            eventId: "b",
            frame: EventPosition(height: 40, left: 100, top: 60, width: 80),
            isAllDay: false
        )
        let next = GridFocusNavigator.adjacent(
            focused: upper,
            direction: .down,
            candidates: [upper, lower],
            layoutMode: .week
        )
        XCTAssertEqual(next?.eventId, "a")
    }
}
