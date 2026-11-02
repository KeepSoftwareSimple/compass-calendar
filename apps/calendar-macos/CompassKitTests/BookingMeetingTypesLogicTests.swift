import XCTest
@testable import CompassKit

final class BookingMeetingTypesLogicTests: XCTestCase {
    func testDerivesDefaultTypeForPagesSavedBeforeMeetingTypes() {
        let types = BookingMeetingTypesLogic.resolve(durationMinutes: .v45, meetingTypes: nil)
        XCTAssertEqual(types, [
            BookingPageMeetingTypes(durationMinutes: .v45, id: "default", label: "45 min meeting"),
        ])
        XCTAssertEqual(
            BookingMeetingTypesLogic.resolve(durationMinutes: .v30, meetingTypes: []).map(\.id),
            ["default"]
        )
    }

    func testKeepsStoredTypesInOrder() {
        let stored = [
            BookingPageMeetingTypes(durationMinutes: .v30, id: "default", label: "Quick chat"),
            BookingPageMeetingTypes(durationMinutes: .v60, id: "type-deep", label: "Deep dive"),
        ]
        XCTAssertEqual(
            BookingMeetingTypesLogic.resolve(durationMinutes: .v30, meetingTypes: stored),
            stored
        )
    }

    func testSummaryNamesOnlyTheOtherTypes() {
        XCTAssertNil(BookingMeetingTypesLogic.otherTypesSummary([
            BookingPageMeetingTypes(durationMinutes: .v30, id: "default", label: "Quick chat"),
        ]))
        XCTAssertEqual(
            BookingMeetingTypesLogic.otherTypesSummary([
                BookingPageMeetingTypes(durationMinutes: .v30, id: "default", label: "Quick chat"),
                BookingPageMeetingTypes(durationMinutes: .v60, id: "type-deep", label: "Deep dive"),
                BookingPageMeetingTypes(durationMinutes: .v15, id: "type-short", label: "Check-in"),
            ]),
            "Also offered: Deep dive (60 min), Check-in (15 min). Edit types on the web."
        )
    }
}
