import XCTest
@testable import CompassKit

final class CalendarWindowMathTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EffectiveTimeZone.identifier = "UTC"
    }

    func testComputeVisibleDayCount() {
        XCTAssertEqual(CalendarWindowMath.computeVisibleDayCount(trackWidth: 320), 1)
        XCTAssertEqual(CalendarWindowMath.computeVisibleDayCount(trackWidth: 500), 3)
        XCTAssertEqual(CalendarWindowMath.computeVisibleDayCount(trackWidth: 1020), 6)
        XCTAssertEqual(CalendarWindowMath.computeVisibleDayCount(trackWidth: 1030), 7)
    }

    func testComputeVisibleWindowOffset() {
        XCTAssertEqual(
            CalendarWindowMath.computeVisibleWindowOffset(anchorIndex: 3, visibleDayCount: 3),
            2
        )
        XCTAssertEqual(
            CalendarWindowMath.computeVisibleWindowOffset(anchorIndex: 0, visibleDayCount: 3),
            0
        )
    }

    func testDayEventQueryRangeUsesExclusiveEnd() throws {
        let anchor = try XCTUnwrap(
            CompassDateParsing.calendarDateInEffectiveTimeZone("2026-06-28")
        )
        let range = CalendarWindowMath.dayEventQueryRange(date: anchor)
        XCTAssertTrue(range.startDate.hasPrefix("2026-06-28T00:00:00"))
        XCTAssertTrue(range.endDate.hasPrefix("2026-06-29T00:00:00"))
    }
}
