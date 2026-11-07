import XCTest
@testable import CompassData

final class EdgeFocusHintTests: XCTestCase {
    func testTimedStartEdgeTeachesVerticalNudge() {
        let text = EdgeFocusHint.statusText(
            edge: .startDate,
            isAllDay: false,
            announcement: "Editing start time"
        )
        XCTAssertTrue(text.contains("Shift+ArrowUp/ArrowDown adjusts start"))
        XCTAssertTrue(text.contains("Tab cycles target"))
        XCTAssertFalse(text == "Editing start time")
    }

    func testNudgeResultKeepsTimeLabel() {
        let text = EdgeFocusHint.statusText(
            edge: .startDate,
            isAllDay: false,
            announcement: "Start 9:15 AM"
        )
        XCTAssertTrue(text.hasPrefix("Start 9:15 AM"))
        XCTAssertTrue(text.contains("adjusts start"))
    }
}
