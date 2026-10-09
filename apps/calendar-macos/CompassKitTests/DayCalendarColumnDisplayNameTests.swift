import XCTest
@testable import CompassKit

final class DayCalendarColumnDisplayNameTests: XCTestCase {
    func testEmailUsesLocalPartWhenUnique() {
        XCTAssertEqual(
            DayCalendarColumnDisplayName.format("tyler@tylerdane.com"),
            "tyler"
        )
    }

    func testDisambiguatesDuplicateEmailLocalParts() {
        XCTAssertEqual(
            DayCalendarColumnDisplayName.displayNames(for: [
                "tyler@tylerdane.com",
                "tyler@keepsoftwaresimple.com",
            ]),
            ["tylerdane", "keepsoftwaresimple"]
        )
    }

    func testOrdinaryNamesUnchanged() {
        XCTAssertEqual(
            DayCalendarColumnDisplayName.format("Holidays in United States"),
            "Holidays in United States"
        )
    }
}
