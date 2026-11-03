import Foundation

public enum TimeZoneFormatting {
    private static let utcLikeTimeZoneIds: Set<String> = [
        "UTC", "Etc/UTC", "Etc/GMT", "GMT",
    ]

    public static func isUtcLikeTimeZone(_ identifier: String) -> Bool {
        utcLikeTimeZoneIds.contains(identifier)
    }

    public static func isValidTimeZone(_ identifier: String) -> Bool {
        TimeZone(identifier: identifier) != nil
    }

    /// Matches web `formatTimeZoneAbbreviation` (Intl short, offset fallback).
    public static func abbreviation(for timeZoneId: String, at date: Date = Date()) -> String {
        guard let zone = TimeZone(identifier: timeZoneId) else { return timeZoneId }
        if timeZoneId == "UTC" {
            return "UTC"
        }

        let short = timeZoneNamePart(timeZone: zone, at: date, style: .short)
        if let short, !looksLikeIanaId(short) {
            return short
        }

        if let offset = timeZoneNamePart(timeZone: zone, at: date, style: .shortOffset) {
            return offset
        }
        return short ?? timeZoneId
    }

    public static func cityName(for timeZoneId: String) -> String {
        let parts = timeZoneId.split(separator: "/")
        guard let city = parts.last else { return timeZoneId }
        return city.replacingOccurrences(of: "_", with: " ")
    }

    private enum NameStyle {
        case short
        case shortOffset
    }

    private static func timeZoneNamePart(
        timeZone: TimeZone,
        at date: Date,
        style: NameStyle
    ) -> String? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        switch style {
        case .short:
            formatter.dateFormat = "zzz"
        case .shortOffset:
            formatter.dateFormat = "ZZZZZ"
        }
        let value = formatter.string(from: date)
        return value.isEmpty ? nil : value
    }

    private static func looksLikeIanaId(_ value: String) -> Bool {
        value.contains("/")
    }
}
