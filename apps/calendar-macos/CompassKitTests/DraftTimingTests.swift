import Foundation
import XCTest
@testable import CompassKit

final class DraftTimingTests: XCTestCase {
    func testPreserveDurationWhenEndMovesBeforeStart() {
        let start = Date(timeIntervalSince1970: 0)
        let end = start.addingTimeInterval(3600)
        let newEnd = start.addingTimeInterval(-1800)
        let adjustedStart = DraftTiming.preserveDurationWhenEndMovesBeforeStart(
            oldStart: start,
            oldEnd: end,
            newEnd: newEnd
        )
        XCTAssertEqual(adjustedStart, newEnd.addingTimeInterval(-3600))
    }

    func testPreserveDurationWhenStartMovesPastEnd() {
        let start = Date(timeIntervalSince1970: 0)
        let end = start.addingTimeInterval(3600)
        let newStart = end.addingTimeInterval(1800)
        let adjustedEnd = DraftTiming.preserveDurationWhenStartMovesPastEnd(
            oldStart: start,
            oldEnd: end,
            newStart: newStart
        )
        XCTAssertEqual(adjustedEnd, newStart.addingTimeInterval(3600))
    }
}
