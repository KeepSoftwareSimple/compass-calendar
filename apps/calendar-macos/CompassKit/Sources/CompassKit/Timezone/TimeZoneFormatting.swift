import Foundation

public enum TimeZoneFormatting {
    public static func isValidTimeZone(_ identifier: String) -> Bool {
        TimeZone(identifier: identifier) != nil
    }

    public static func abbreviation(for timeZoneId: String, at date: Date = Date()) -> String {
        guard let zone = TimeZone(identifier: timeZoneId) else { return timeZoneId }
        let formatter = DateFormatter()
        formatter.timeZone = zone
        formatter.dateFormat = "z"
        return formatter.string(from: date)
    }

    public static func cityName(for timeZoneId: String) -> String {
        let parts = timeZoneId.split(separator: "/")
        guard let city = parts.last else { return timeZoneId }
        return city.replacingOccurrences(of: "_", with: " ")
    }
}
