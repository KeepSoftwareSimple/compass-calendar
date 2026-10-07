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
        XCTAssertEqual(targets.map(\.digit), ["1", "2", "3", "4"])
        XCTAssertEqual(targets[1].id, PageJumpTargets.dayColumnJumpId(calendarId: "cal-a"))
        XCTAssertEqual(targets[2].id, PageJumpTargets.dayColumnJumpId(calendarId: "cal-b"))
        XCTAssertEqual(targets.last?.id, "calendars")
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
        XCTAssertEqual(widths.count, 2)
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
