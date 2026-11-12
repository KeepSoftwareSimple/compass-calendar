import CompassKit
import XCTest

final class CalendarTimeZoneHintTests: XCTestCase {
    private func makeCalendar(
        id: String,
        isPrimary: Bool,
        isVisible: Bool = true,
        timeZone: String?
    ) -> CompassCalendar {
        let capabilities = CompassCalendarCapabilities(
            canInviteAttendees: false,
            canManage: false,
            canReadAvailability: true,
            canReadDetails: true,
            canWatchEvents: false,
            canWrite: true,
            conferenceKinds: []
        )
        return CompassCalendar(
            access: .owner,
            accountEmail: "a@example.com",
            backgroundColor: "#ffffff",
            capabilities: capabilities,
            conference: nil,
            createsGoogleMeet: false,
            description: "",
            foregroundColor: "#000000",
            id: id,
            isActive: true,
            isPrimary: isPrimary,
            isVisible: isVisible,
            name: id,
            provider: "google",
            timeZone: timeZone.map { IANATimeZone(rawValue: $0) }
        )
    }

    func testPrimaryHintSurvivesHiddenCalendar() {
        let primary = makeCalendar(
            id: "primary",
            isPrimary: true,
            isVisible: false,
            timeZone: "America/Denver"
        )
        let visible = makeCalendar(
            id: "visible",
            isPrimary: false,
            timeZone: "America/New_York"
        )

        XCTAssertEqual(
            CalendarTimeZoneHint.pick(from: [primary, visible]),
            "America/Denver"
        )
    }

    /// Shared vector with web `calendar-timezone-hint.test.ts`. A zone-less
    /// primary must not consume the primary preference: the second account's
    /// primary wins over the earlier non-primary zone.
    func testZonelessPrimaryDoesNotConsumeThePrimaryPreference() {
        let calendars = [
            makeCalendar(id: "acctA-primary", isPrimary: true, timeZone: nil),
            makeCalendar(id: "acctA-shared", isPrimary: false, timeZone: "America/Chicago"),
            makeCalendar(id: "acctB-primary", isPrimary: true, timeZone: "America/New_York"),
        ]

        XCTAssertEqual(
            CalendarTimeZoneHint.pick(from: calendars),
            "America/New_York"
        )
    }

    /// An empty zone is not a usable hint, matching web truthiness.
    func testEmptyPrimaryZoneFallsThroughToARegionalZone() {
        let calendars = [
            makeCalendar(id: "primary", isPrimary: true, timeZone: ""),
            makeCalendar(id: "other", isPrimary: false, timeZone: "America/Chicago"),
        ]

        XCTAssertEqual(
            CalendarTimeZoneHint.pick(from: calendars),
            "America/Chicago"
        )
    }
}
