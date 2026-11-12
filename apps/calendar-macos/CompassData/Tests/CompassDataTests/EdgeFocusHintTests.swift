import CompassKit
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

    func testAllDayWholeEventUsesHorizontalArrows() {
        let text = EdgeFocusHint.statusText(
            edge: nil,
            isAllDay: true,
            announcement: "Editing whole event"
        )
        XCTAssertTrue(text.contains("ArrowLeft/ArrowRight"))
        XCTAssertTrue(text.contains("moves event"))
        XCTAssertFalse(text.contains("ArrowUp"))
    }

    func testAllDayStartEdgeUsesHorizontalArrows() {
        let text = EdgeFocusHint.statusText(
            edge: .startDate,
            isAllDay: true,
            announcement: "Editing start time"
        )
        XCTAssertTrue(text.contains("ArrowLeft/ArrowRight adjusts start date"))
    }

    func testTimedEndEdgeAfterNudgeShowsConcreteEndTime() {
        let text = EdgeFocusHint.statusText(
            edge: .endDate,
            isAllDay: false,
            announcement: "End 5:00 PM"
        )
        XCTAssertTrue(text.hasPrefix("End 5:00 PM"))
        XCTAssertTrue(text.contains("ArrowUp/ArrowDown adjusts end"))
        XCTAssertFalse(text.contains("Editing end time"))
    }

    @MainActor
    func testFocusStoreKeepsAllDayFlagForEdgeHints() {
        let store = FocusStore(view: .week)
        let id = EventId(rawValue: "all-day-1")
        store.register(eventId: id, eventType: .allDay)
        store.setEdge(
            eventId: id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: true
        )
        XCTAssertTrue(store.edgeFocusIsAllDay)
        XCTAssertEqual(store.edge, .startDate)

        let hint = EdgeFocusHint.statusText(
            edge: store.edge,
            isAllDay: store.edgeFocusIsAllDay,
            announcement: store.edgeAnnouncement
        )
        XCTAssertTrue(hint.contains("ArrowLeft/ArrowRight adjusts start date"))

        store.setEdge(
            eventId: id,
            edge: .endDate,
            announcement: "Editing end time",
            isAllDay: true
        )
        XCTAssertEqual(store.edge, .endDate)
    }
}
