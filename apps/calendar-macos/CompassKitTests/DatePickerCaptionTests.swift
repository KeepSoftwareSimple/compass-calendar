import CompassKit
import XCTest

final class DatePickerCaptionTests: XCTestCase {
    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    func testCaptionWalksYearThenMonthThenDay() {
        XCTAssertEqual(DatePickerCaption.View.year.afterSelect, .month)
        XCTAssertEqual(DatePickerCaption.View.month.afterSelect, .day)
        XCTAssertNil(DatePickerCaption.View.day.afterSelect)
    }

    func testReactYearPagesMatchWebDatepicker() {
        XCTAssertEqual(DatePickerCaption.reactYearPage(containing: 1993).first, 1981)
        XCTAssertEqual(DatePickerCaption.reactYearPage(containing: 1993).last, 2000)
        XCTAssertEqual(DatePickerCaption.reactYearPage(containing: 2026).first, 2021)
        XCTAssertEqual(DatePickerCaption.reactYearPage(containing: 2026).last, 2040)
        XCTAssertEqual(DatePickerCaption.reactYearPage(containing: 1993).count, 20)
    }

    func testCaptionTextMatchesWeb() {
        XCTAssertEqual(DatePickerCaption.caption(view: .day, monthTitle: "Jun 2026", year: 2026), "Jun 2026")
        XCTAssertEqual(
            DatePickerCaption.caption(view: .year, monthTitle: "Jun 2026", year: 2026),
            "Years 2021 to 2040")
        XCTAssertEqual(DatePickerCaption.caption(view: .month, monthTitle: "Jun 2026", year: 2026), "Select month, 2026")
        XCTAssertEqual(DatePickerCaption.yearRangeCaption(pageAnchorYear: 1993), "Years 1981 to 2000")
    }

    func testRangeLimitsYearsMonthsAndDays() {
        let minimum = date(1900, 1, 1)
        let maximum = date(2026, 6, 10)
        XCTAssertFalse(DatePickerCaption.isYearAllowed(1899, minimum: minimum, maximum: maximum, calendar: calendar))
        XCTAssertTrue(DatePickerCaption.isYearAllowed(2026, minimum: minimum, maximum: maximum, calendar: calendar))
        XCTAssertFalse(DatePickerCaption.isYearAllowed(2027, minimum: minimum, maximum: maximum, calendar: calendar))
        XCTAssertTrue(DatePickerCaption.isMonthAllowed(year: 2026, month: 6, minimum: minimum, maximum: maximum, calendar: calendar))
        XCTAssertFalse(DatePickerCaption.isMonthAllowed(year: 2026, month: 7, minimum: minimum, maximum: maximum, calendar: calendar))
        XCTAssertTrue(DatePickerCaption.isDayAllowed(date(2026, 6, 10), minimum: minimum, maximum: maximum, calendar: calendar))
        XCTAssertFalse(DatePickerCaption.isDayAllowed(date(2026, 6, 11), minimum: minimum, maximum: maximum, calendar: calendar))
        XCTAssertFalse(DatePickerCaption.isDayAllowed(date(1899, 12, 31), minimum: minimum, maximum: maximum, calendar: calendar))
    }

    func testPickedDayIsStoredAsIsoDate() {
        let saved = EffectiveTimeZone.identifier
        defer { EffectiveTimeZone.identifier = saved }
        EffectiveTimeZone.identifier = "UTC"
        XCTAssertEqual(LifeDateFormat.stored(from: date(1990, 2, 3)), "1990-02-03")
    }
}
