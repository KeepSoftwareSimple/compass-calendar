import Foundation

enum RecurrenceFloatingTime {
    private static var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    /// Wall clock in `timeZone` stored as UTC field values (mirrors `toFloatingDate`).
    static func toFloating(wall: Date, timeZone: TimeZone) -> Date {
        var local = Calendar(identifier: .gregorian)
        local.timeZone = timeZone
        let components = local.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: wall
        )
        var utc = utcCalendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: Date(timeIntervalSince1970: 0)
        )
        utc.year = components.year
        utc.month = components.month
        utc.day = components.day
        utc.hour = components.hour
        utc.minute = components.minute
        utc.second = components.second
        utc.nanosecond = components.nanosecond
        return utcCalendar.date(from: utc) ?? wall
    }

    /// Inverse of `toFloating` (mirrors `localizeFloatingDate`).
    static func localize(floating: Date, timeZone: TimeZone) -> Date {
        let components = utcCalendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: floating
        )
        let wallString = String(
            format: "%04d-%02d-%02dT%02d:%02d:%02d.%03d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0,
            components.hour ?? 0,
            components.minute ?? 0,
            components.second ?? 0,
            (components.nanosecond ?? 0) / 1_000_000
        )
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS"
        return formatter.date(from: wallString) ?? floating
    }

    static func floatingComponents(from floating: Date) -> DateComponents {
        utcCalendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: floating
        )
    }

    static func addDays(to floating: Date, days: Int) -> Date {
        utcCalendar.date(byAdding: .day, value: days, to: floating) ?? floating
    }

    static func addMonths(to floating: Date, months: Int) -> Date {
        utcCalendar.date(byAdding: .month, value: months, to: floating) ?? floating
    }

    /// rrule.js weekday index: MO=0 … SU=6.
    static func rruleWeekdayIndex(fromFloating floating: Date) -> Int {
        let weekday = utcCalendar.component(.weekday, from: floating)
        return (weekday + 5) % 7
    }

    static func daysBetween(start: Date, end: Date) -> Int {
        let startDay = utcCalendar.startOfDay(for: start)
        let endDay = utcCalendar.startOfDay(for: end)
        return utcCalendar.dateComponents([.day], from: startDay, to: endDay).day ?? 0
    }
}
