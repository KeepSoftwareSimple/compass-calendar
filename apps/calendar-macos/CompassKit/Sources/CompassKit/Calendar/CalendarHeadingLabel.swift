import Foundation

/// Port of `getCalendarHeadingLabel` from the web date utilities.
public enum CalendarHeadingLabel {
    public static func format(start: Date, end: Date, now: Date = Date()) -> String {
        let calendar = EffectiveTimeZone.calendar
        let startsThisYear = calendar.component(.year, from: start) == calendar.component(.year, from: now)
        let endsThisYear = calendar.component(.year, from: end) == calendar.component(.year, from: now)

        let startOfStart = calendar.startOfDay(for: start)
        let startOfEnd = calendar.startOfDay(for: end)
        let startOfNow = calendar.startOfDay(for: now)
        let todayInView = startOfNow >= startOfStart && startOfNow <= startOfEnd
        let anchor = todayInView ? now : start

        let monthYear = DateFormatter()
        monthYear.locale = Locale(identifier: "en_US_POSIX")
        monthYear.timeZone = EffectiveTimeZone.timeZone
        monthYear.dateFormat = "MMMM yyyy"

        if startsThisYear, endsThisYear {
            return monthYear.string(from: anchor)
        }
        if startsThisYear || endsThisYear {
            let short = DateFormatter()
            short.locale = Locale(identifier: "en_US_POSIX")
            short.timeZone = EffectiveTimeZone.timeZone
            short.dateFormat = "MMM yy"
            return "\(short.string(from: start)) - \(short.string(from: end))"
        }
        return monthYear.string(from: anchor)
    }
}
