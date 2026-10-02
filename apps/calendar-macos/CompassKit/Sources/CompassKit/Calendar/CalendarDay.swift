import Foundation

/// A calendar date (`YYYY-MM-DD`) in the effective timezone.
public struct CalendarDay: Hashable, Sendable, Codable {
    public let year: Int
    public let month: Int
    public let day: Int

    public init?(ymd: String) {
        let parts = ymd.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2])
        else {
            return nil
        }
        self.year = year
        self.month = month
        self.day = day
    }

    public init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    public var key: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    public func startOfDay() -> Date? {
        CompassDateParsing.calendarDateInEffectiveTimeZone(key)
    }

    public func addingDays(_ days: Int) -> CalendarDay? {
        guard let start = startOfDay(),
              let next = EffectiveTimeZone.calendar.date(byAdding: .day, value: days, to: start)
        else {
            return nil
        }
        let ymd = CompassDateParsing.formatCalendarDay(next)
        return CalendarDay(ymd: ymd)
    }
}
