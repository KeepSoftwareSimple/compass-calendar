import XCTest
@testable import CompassKit

final class CalendarGridSidebarHintsTests: XCTestCase {
    func testCalendarGridModeHintsEligibleOnlyOnGridViews() {
        XCTAssertTrue(CalendarGridSidebarHints.calendarGridModeHintsEligible(isLifeView: false))
        XCTAssertFalse(CalendarGridSidebarHints.calendarGridModeHintsEligible(isLifeView: true))
    }
}
