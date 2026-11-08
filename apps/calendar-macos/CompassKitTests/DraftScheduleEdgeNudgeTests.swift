import XCTest
@testable import CompassKit

final class DraftScheduleEdgeNudgeTests: XCTestCase {
    func testTimedStartEdgeMovesLaterWithoutTouchingEnd() throws {
        let start = try parse("2026-05-20T10:00:00.000Z")
        let end = try parse("2026-05-20T10:30:00.000Z")
        let schedule = DraftSchedule(start: start, end: end, kind: .timed)
        let result = try XCTUnwrap(
            DraftNudge.nudgeScheduleEdgeByKeyboard(schedule: schedule, edge: .start, key: "ArrowDown")
        )
        XCTAssertEqual(result.edge, .start)
        XCTAssertEqual(result.schedule.end, end)
        XCTAssertEqual(result.schedule.start, try parse("2026-05-20T10:15:00.000Z"))
    }

    func testTimedEndEdgeMovesEarlierWithoutTouchingStart() throws {
        let start = try parse("2026-05-20T10:00:00.000Z")
        let end = try parse("2026-05-20T10:30:00.000Z")
        let schedule = DraftSchedule(start: start, end: end, kind: .timed)
        let result = try XCTUnwrap(
            DraftNudge.nudgeScheduleEdgeByKeyboard(schedule: schedule, edge: .end, key: "ArrowUp")
        )
        XCTAssertEqual(result.edge, .end)
        XCTAssertEqual(result.schedule.start, start)
        XCTAssertEqual(result.schedule.end, try parse("2026-05-20T10:15:00.000Z"))
    }

    func testWholeEventShiftArrowDownMovesBothEdges() throws {
        let start = try parse("2026-05-20T10:00:00.000Z")
        let end = try parse("2026-05-20T10:30:00.000Z")
        let schedule = DraftSchedule(start: start, end: end, kind: .timed)
        let moved = try XCTUnwrap(
            DraftNudge.nudgeScheduleByKeyboard(schedule: schedule, key: "ArrowDown")
        )
        XCTAssertEqual(moved.start, try parse("2026-05-20T10:15:00.000Z"))
        XCTAssertEqual(moved.end, try parse("2026-05-20T10:45:00.000Z"))
    }

    private func parse(_ raw: String) throws -> Date {
        let previous = EffectiveTimeZone.identifier
        EffectiveTimeZone.identifier = "UTC"
        defer { EffectiveTimeZone.identifier = previous }
        return try XCTUnwrap(CompassDateParsing.parseInEffectiveTimeZone(raw))
    }
}
