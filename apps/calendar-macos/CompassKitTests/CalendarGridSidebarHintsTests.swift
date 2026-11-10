import XCTest
@testable import CompassKit

final class CalendarGridSidebarHintsTests: XCTestCase {
    func testCalendarGridModeHintsEligibleOnlyOnGridViews() {
        XCTAssertTrue(CalendarGridSidebarHints.calendarGridModeHintsEligible(view: .week))
        XCTAssertTrue(CalendarGridSidebarHints.calendarGridModeHintsEligible(view: .day))
        XCTAssertFalse(CalendarGridSidebarHints.calendarGridModeHintsEligible(view: .life))
    }
}
