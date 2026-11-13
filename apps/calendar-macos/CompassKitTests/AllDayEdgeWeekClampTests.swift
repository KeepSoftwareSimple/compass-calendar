import XCTest
@testable import CompassKit

final class AllDayEdgeWeekClampTests: XCTestCase {
    func testWouldAllDayStartEdgeLeavingWeekBeforeVisibleStart() throws {
        let visibleStart = try day(2026, 1, 5)
        let visibleEnd = try day(2026, 1, 11)
        let schedule = allDay(start: visibleStart, inclusiveEnd: visibleStart)
        XCTAssertTrue(
            DraftNudge.wouldAllDayEdgeLeaveVisibleWeek(
                schedule: schedule,
                edge: .start,
                daysDelta: -1,
                visibleStart: visibleStart,
                visibleEndInclusive: visibleEnd
            )
        )
    }

    func testWouldAllDayEndEdgeLeavingWeekAfterVisibleEnd() throws {
        let visibleStart = try day(2026, 1, 5)
        let visibleEnd = try day(2026, 1, 11)
        let calendar = EffectiveTimeZone.calendar
        let exclusiveEnd = try XCTUnwrap(calendar.date(byAdding: .day, value: 1, to: visibleEnd))
        let schedule = allDay(start: visibleStart, exclusiveEnd: exclusiveEnd)
        XCTAssertTrue(
            DraftNudge.wouldAllDayEdgeLeaveVisibleWeek(
                schedule: schedule,
                edge: .end,
                daysDelta: 1,
                visibleStart: visibleStart,
                visibleEndInclusive: visibleEnd
            )
        )
    }

    func testEdgeNudgeRejectsMoveOutsideWeekWhenClampProvided() throws {
        let visibleStart = try day(2026, 1, 5)
        let visibleEnd = try day(2026, 1, 11)
        let schedule = allDay(start: visibleStart, inclusiveEnd: visibleStart)
        let clamp = (visibleStart: visibleStart, visibleEndInclusive: visibleEnd)
        XCTAssertNil(
            DraftNudge.nudgeScheduleEdgeByKeyboard(
                schedule: schedule,
                edge: .start,
                key: "ArrowLeft",
                weekViewClamp: clamp
            )
        )
    }

    func testEdgeNudgeAllowsMoveInsideWeekWithClamp() throws {
        let visibleStart = try day(2026, 1, 5)
        let visibleEnd = try day(2026, 1, 11)
        let start = try day(2026, 1, 7)
        let schedule = allDay(start: start, inclusiveEnd: start)
        let clamp = (visibleStart: visibleStart, visibleEndInclusive: visibleEnd)
        XCTAssertNotNil(
            DraftNudge.nudgeScheduleEdgeByKeyboard(
                schedule: schedule,
                edge: .start,
                key: "ArrowRight",
                weekViewClamp: clamp
            )
        )
    }

    private func day(_ year: Int, _ month: Int, _ day: Int) throws -> Date {
        try XCTUnwrap(
            EffectiveTimeZone.calendar.date(from: DateComponents(year: year, month: month, day: day))
        )
    }

    private func allDay(start: Date, inclusiveEnd: Date) -> DraftSchedule {
        let calendar = EffectiveTimeZone.calendar
        let exclusiveEnd =
            calendar.date(byAdding: .day, value: 1, to: inclusiveEnd) ?? inclusiveEnd
        return DraftSchedule(start: start, end: exclusiveEnd, kind: .allDay)
    }

    private func allDay(start: Date, exclusiveEnd: Date) -> DraftSchedule {
        DraftSchedule(start: start, end: exclusiveEnd, kind: .allDay)
    }
}
