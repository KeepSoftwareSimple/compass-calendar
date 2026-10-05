import Foundation

public enum CompassDateParsing {
    // Cached formatters are configured once; reads are concurrent, writes never happen after init.
    private nonisolated(unsafe) static let wallTimeFormatters: [DateFormatter] = {
        let formats = [
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
        ]
        return formats.map { format in
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = EffectiveTimeZone.calendar
            formatter.timeZone = EffectiveTimeZone.timeZone
            formatter.dateFormat = format
            return formatter
        }
    }()

    private nonisolated(unsafe) static let iso8601WithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return formatter
    }()

    private nonisolated(unsafe) static let iso8601Internet: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    public static func parseInEffectiveTimeZone(_ value: String) -> Date? {
        if value.contains("Z") || hasExplicitOffset(value) {
            if let date = iso8601WithFractional.date(from: value) {
                return date
            }
            if let date = iso8601Internet.date(from: value) {
                return date
            }
        }

        for formatter in wallTimeFormatters {
            if let date = formatter.date(from: value) {
                return date
            }
        }

        if value.count == 10, value.contains("-") {
            return calendarDateInEffectiveTimeZone(value)
        }

        return nil
    }

    public static func calendarDateInEffectiveTimeZone(_ ymd: String) -> Date? {
        let parts = ymd.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2])
        else {
            return nil
        }

        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 0
        components.minute = 0
        components.second = 0
        return EffectiveTimeZone.calendar.date(from: components)
    }

    public static func formatLikeDayjs(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = EffectiveTimeZone.calendar
        formatter.timeZone = EffectiveTimeZone.timeZone
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssXXXXX"
        return formatter.string(from: date)
    }

    static func formatISO8601UTC(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }

    public static func formatCalendarDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = EffectiveTimeZone.calendar
        formatter.timeZone = EffectiveTimeZone.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func hasExplicitOffset(_ value: String) -> Bool {
        guard value.count >= 6 else { return false }
        let suffix = value.suffix(6)
        guard let third = suffix.dropFirst(3).first else { return false }
        return (suffix.first == "+" || suffix.first == "-") && third == ":"
    }
}
