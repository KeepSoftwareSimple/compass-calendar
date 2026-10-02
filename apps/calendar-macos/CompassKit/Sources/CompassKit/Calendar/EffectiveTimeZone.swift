import Foundation

/// Calendar math uses one explicit timezone, mirroring the web effective timezone store.
public enum EffectiveTimeZone: Sendable {
    public static var identifier: String = "UTC"

    public static var timeZone: TimeZone {
        TimeZone(identifier: identifier) ?? .gmt
    }

    public static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }
}
