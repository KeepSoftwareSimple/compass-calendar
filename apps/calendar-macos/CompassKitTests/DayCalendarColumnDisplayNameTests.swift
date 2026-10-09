import XCTest
@testable import CompassKit

final class DayCalendarColumnDisplayNameTests: XCTestCase {
    func testEmailUsesLocalPart() {
        XCTAssertEqual(
            DayCalendarColumnDisplayName.format("tyler@tylerdane.com"),
            "tyler"
        )
    }

    func testOrdinaryNamesUnchanged() {
        XCTAssertEqual(
            DayCalendarColumnDisplayName.format("Holidays in United States"),
            "Holidays in United States"
        )
    }
}
