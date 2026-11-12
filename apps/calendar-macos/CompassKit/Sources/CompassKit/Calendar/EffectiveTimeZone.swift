import Foundation

/// Calendar math uses one explicit timezone, mirroring the web effective timezone store.
public enum EffectiveTimeZone: Sendable {
    // Matches the web pinned-timezone store: UI/config writes; layout math reads.
    private nonisolated(unsafe) static var identifierStorage = "UTC"

    public static var identifier: String {
        get { identifierStorage }
        set { identifierStorage = newValue }
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
