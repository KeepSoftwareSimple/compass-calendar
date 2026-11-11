import CompassKit
import XCTest

final class ContextualHintTiersTests: XCTestCase {
    func testGridDayPrimaryStaysScannable() {
        let hint = ContextualHintTiers.gridDay()
        XCTAssertEqual(hint.primary.count, 3)
        XCTAssertTrue(hint.primary.joined(separator: " ").contains("move date"))
        XCTAssertFalse(hint.primary.joined(separator: " ").contains("Page Down"))
        XCTAssertTrue(hint.secondary.joined(separator: " ").contains("Page Down"))
    }

    func testEventFormFooterHidesTabRowWhileDatePickerOpen() {
        let open = ContextualHintTiers.eventFormFooter(
            tabNavigationApplies: true,
            datePickerCalendarOpen: true)
        XCTAssertTrue(open.primary.joined(separator: " ").contains("move date"))
        XCTAssertFalse(open.primary.joined(separator: " ").contains("between fields"))
    }

    func testEventFormFooterTucksActionsBehindSecondaryWhenTabsApply() {
        let form = ContextualHintTiers.eventFormFooter(
            tabNavigationApplies: true,
            datePickerCalendarOpen: false)
        XCTAssertTrue(form.primary.joined(separator: " ").contains("between fields"))
        XCTAssertTrue(form.secondary.joined(separator: " ").contains("for actions"))
    }
}
