import Foundation
import XCTest
@testable import CompassKit

final class LifeMathTests: XCTestCase {
    private var calendar: Calendar!

    override func setUp() {
        super.setUp()
        calendar = Calendar(identifier: .gregorian)
    }

    func testWeekLivedCount() {
        let today = date(2026, 1, 1)
        XCTAssertEqual(
            LifeMath.weekLivedCount(
                birthDateValue: "2000-01-01",
                totalDots: 79 * 52,
                today: today),
            1356)
        XCTAssertEqual(
            LifeMath.weekLivedCount(
                birthDateValue: "2026-12-31",
                totalDots: 79 * 52,
                today: today),
            0)
    }

    func testTotalDotsClampsLifespan() {
        XCTAssertEqual(LifeMath.totalLifeDots(lifespan: 85), 85 * 52)
        XCTAssertEqual(LifeMath.totalLifeDots(lifespan: -1), 1 * 52)
        XCTAssertEqual(LifeMath.totalLifeDots(lifespan: 151), 150 * 52)
    }

    func testParseLifeDate() {
        XCTAssertEqual(LifeMath.parseLifeDate("2024-02-29")?.dayComponent(calendar), 29)
        XCTAssertNil(LifeMath.parseLifeDate("2025-02-29"))
    }

    func testRandomLifespanBounds() {
        let today = date(2026, 7, 21)
        XCTAssertEqual(
            LifeMath.randomLifespan(birthDateValue: "1993-09-14", today: today, random: { 0 }),
            32)
        XCTAssertEqual(
            LifeMath.randomLifespan(birthDateValue: "1993-09-14", today: today, random: { 0.999 }),
            100)
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }
}

private extension Date {
    func dayComponent(_ calendar: Calendar) -> Int {
        calendar.component(.day, from: self)
    }
}
