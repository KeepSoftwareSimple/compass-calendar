import CompassKit
import XCTest

final class CalendarSidebarDisplayNameTests: XCTestCase {
    private func calendar(
        name: String,
        accountEmail: String?,
        isPrimary: Bool,
    ) -> CompassCalendar {
        CompassCalendar(
            access: .owner,
            accountEmail: accountEmail,
            backgroundColor: "#ffffff",
            capabilities: CompassCalendarCapabilities(
                canInviteAttendees: true,
                canManage: true,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: true,
                canWrite: true,
                conferenceKinds: [],
            ),
            description: "",
            foregroundColor: "#000000",
            id: "cal-1",
            isActive: true,
            isPrimary: isPrimary,
            isVisible: true,
            name: name,
            provider: "microsoft",
            timeZone: nil,
        )
    }

    func testPrimaryNamedLikeAccountEmailReadsPrimaryUnderHeading() {
        let calendar = calendar(
            name: "ahab@pequod.com",
            accountEmail: "ahab@pequod.com",
            isPrimary: true,
        )
        XCTAssertEqual(
            CalendarSidebarDisplayName.rowTitle(for: calendar, underAccountHeading: true),
            "primary",
        )
    }

    func testPrimaryWithDistinctTitleKeepsCalendarName() {
        let calendar = calendar(
            name: "Calendar",
            accountEmail: "user@outlook.com",
            isPrimary: true,
        )
        XCTAssertEqual(
            CalendarSidebarDisplayName.rowTitle(for: calendar, underAccountHeading: true),
            "Calendar",
        )
    }
}
