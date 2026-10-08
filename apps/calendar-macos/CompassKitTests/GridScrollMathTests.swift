import CompassKit
import XCTest

final class GridScrollMathTests: XCTestCase {
    func testScrollToNowDocumentYUsesWebBuffer() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "UTC"))
        let reference = try XCTUnwrap(
            calendar.date(from: DateComponents(year: 2026, month: 2, day: 5, hour: 12))
        )
        let allDayOffset = 40.0
        let hourHeight = 60.0
        let target = GridScrollMath.scrollToNowDocumentY(
            referenceNow: reference,
            hourHeight: hourHeight,
            allDayOffset: allDayOffset,
            calendar: calendar
        )
        XCTAssertEqual(target, 12 * hourHeight + allDayOffset - GridScrollMath.scrollToNowBufferPx)
    }

    func testIsAtScrollTargetWithinTolerance() {
        XCTAssertTrue(GridScrollMath.isAtScrollTarget(currentY: 100, targetY: 101))
        XCTAssertFalse(GridScrollMath.isAtScrollTarget(currentY: 100, targetY: 110))
    }
}
