import CompassKit
import XCTest

final class CalendarTimeZoneHintTests: XCTestCase {
    func testPrimaryHintSurvivesHiddenCalendar() {
        let capabilities = CompassCalendarCapabilities(
            canInviteAttendees: false,
            canManage: false,
            canReadAvailability: true,
            canReadDetails: true,
            canWatchEvents: false,
            canWrite: true,
            conferenceKinds: []
        )
        let primary = CompassCalendar(
            access: .owner,
            accountEmail: "a@example.com",
            backgroundColor: "#ffffff",
            capabilities: capabilities,
            conference: nil,
            createsGoogleMeet: false,
            description: "",
            foregroundColor: "#000000",
            id: "primary",
            isActive: true,
            isPrimary: true,
            isVisible: false,
            name: "Primary",
            provider: "google",
            timeZone: IANATimeZone(rawValue: "America/Denver")
        )
        let visible = CompassCalendar(
            access: .owner,
            accountEmail: "a@example.com",
            backgroundColor: "#ffffff",
            capabilities: capabilities,
            conference: nil,
            createsGoogleMeet: false,
            description: "",
            foregroundColor: "#000000",
            id: "visible",
            isActive: true,
            isPrimary: false,
            isVisible: true,
            name: "Visible",
            provider: "google",
            timeZone: IANATimeZone(rawValue: "America/New_York")
        )

        XCTAssertEqual(
            CalendarTimeZoneHint.pick(from: [primary, visible]),
            "America/Denver"
        )
    }
}
