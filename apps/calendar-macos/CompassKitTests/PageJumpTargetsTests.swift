import XCTest
@testable import CompassKit

final class PageJumpTargetsTests: XCTestCase {
    func testDayViewNumbersColumnsBeforeSidebarWhenSpaceAllows() {
        let targets = PageJumpTargets.buildDayPageJumpTargets(
            displayedCalendars: [
                (id: "cal-a", name: "Personal"),
                (id: "cal-b", name: "Work"),
            ]
        )
        XCTAssertEqual(targets.map(\.digit), ["1", "2", "3", "4", "5", "6"])
        XCTAssertEqual(
            targets.map(\.id),
            [
                "view-select",
                PageJumpTargets.dayColumnJumpId(calendarId: "cal-a"),
                PageJumpTargets.dayColumnJumpId(calendarId: "cal-b"),
                "month-picker", "up-next", "calendars",
            ])
    }

    /// Web week view: Mod+1 view dropdown, 2 month picker, 3 Up next, 4 calendar list.
    func testWeekViewMatchesWebNumbering() {
        let targets = PageJumpTargets.buildSidebarPageJumpTargets()
        XCTAssertEqual(targets.map(\.id), ["view-select", "month-picker", "up-next", "calendars"])
        XCTAssertEqual(targets.map(\.digit), ["1", "2", "3", "4"])
        XCTAssertEqual(targets.map(\.label), ["View dropdown", "Month picker", "Up next", "Calendar list"])
    }

    /// Web `LIFE_PAGE_JUMP_TARGETS`.
    func testLifeViewMatchesWebNumbering() {
        let targets = PageJumpTargets.buildLifePageJumpTargets()
        XCTAssertEqual(
            targets.map(\.id),
            ["view-select", "life-grid", "life-variation", "life-details"]
        )
        XCTAssertEqual(targets.map(\.digit), ["1", "2", "3", "4"])
        XCTAssertEqual(
            targets.map(\.label),
            ["View dropdown", "Current week", "Life variation", "Life details"]
        )
    }

    /// Web: one target per connected account replaces the single list slot.
    func testWeekViewNumbersEachConnectedAccount() {
        let targets = PageJumpTargets.buildSidebarPageJumpTargets(accounts: [
            (key: "google:a@example.com", label: "a@example.com"),
            (key: "microsoft:b@example.com", label: "b@example.com"),
        ])
        XCTAssertEqual(
            targets.map(\.id),
            [
                "view-select", "month-picker", "up-next",
                PageJumpTargets.calendarAccountJumpId(accountKey: "google:a@example.com"),
                PageJumpTargets.calendarAccountJumpId(accountKey: "microsoft:b@example.com"),
            ])
        XCTAssertEqual(targets.map(\.digit), ["1", "2", "3", "4", "5"])
        XCTAssertFalse(targets.contains { $0.id == "calendars" })
    }

    func testDayViewPutsAccountsAfterColumns() {
        let targets = PageJumpTargets.buildDayPageJumpTargets(
            displayedCalendars: [(id: "cal-a", name: "Personal")],
            accounts: [(key: "google:a@example.com", label: "a@example.com")]
        )
        XCTAssertEqual(targets.last?.id, PageJumpTargets.calendarAccountJumpId(accountKey: "google:a@example.com"))
        XCTAssertEqual(targets.last?.digit, "5")
    }

    func testDayViewDropsSidebarWhenColumnsOverflowPhysicalKeys() {
        let calendars = (0 ..< 14).map { index in
            (id: "cal-\(index)", name: "Calendar \(index)")
        }
        let targets = PageJumpTargets.buildDayPageJumpTargets(displayedCalendars: calendars)
        XCTAssertEqual(targets.count, FormFieldDigitMapping.pickKeyLabels.count)
        XCTAssertFalse(targets.contains { $0.id == "calendars" })
        XCTAssertEqual(
            targets.filter { $0.id.hasPrefix(PageJumpTargets.dayColumnPrefix) }.count,
            FormFieldDigitMapping.pickKeyLabels.count - 1
        )
    }

    func testDayDocumentWidthUsesEventWidthMinimum() {
        let scenario = GridLayoutSnapshotFixtures.parityScenario(
            layoutMode: .day,
            visibleDateKeys: ["2026-05-20"]
        )
        let state = TimeGridState(
            layoutMode: .day,
            scenario: scenario,
            trackWidth: 400
        )
        let widths = state.resolvedColumnWidths()
        // Parity fixture: only Work has visible events on 2026-05-20 (Personal's event is hidden).
        XCTAssertEqual(widths.count, 1)
        XCTAssertGreaterThanOrEqual(widths[0], GridMetrics.eventWidthMinimum)
        XCTAssertGreaterThanOrEqual(state.documentContentWidth(), 400)
    }

    func testDayColumnJumpDigitsMapCalendarIds() {
        let targets = PageJumpTargets.buildDayPageJumpTargets(
            displayedCalendars: [
                (id: "cal-a", name: "Personal"),
                (id: "cal-b", name: "Work"),
            ]
        )
        XCTAssertEqual(
            PageJumpTargets.dayColumnJumpDigits(from: targets),
            ["cal-a": "2", "cal-b": "3"]
        )
    }
}
