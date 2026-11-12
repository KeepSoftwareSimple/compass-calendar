import Foundation

/// Calendar math uses one explicit timezone, mirroring the web effective timezone store.
public enum EffectiveTimeZone: Sendable {
    // Matches the web pinned-timezone store: UI/config writes; layout math reads.
    private nonisolated(unsafe) static var identifierStorage = "UTC"
    private nonisolated(unsafe) static var calendarTimeZoneHintStorage: String?

    public static var identifier: String {
        get { identifierStorage }
        set { identifierStorage = newValue }
    }

    /// Provider calendar zone used for day-query overlap when the effective zone is UTC-like.
    public static var calendarTimeZoneHint: String? {
        get { calendarTimeZoneHintStorage }
        set { calendarTimeZoneHintStorage = newValue }
    }

    public static var timeZone: TimeZone {
        TimeZone(identifier: identifier) ?? .gmt
    }

    public static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }
}
