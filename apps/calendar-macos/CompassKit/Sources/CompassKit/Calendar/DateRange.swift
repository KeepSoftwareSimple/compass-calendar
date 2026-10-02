import Foundation

/// An instant range `[start, end)` used for event fetch windows.
public struct DateRange: Hashable, Sendable {
    public let start: Date
    public let end: Date

    public init(start: Date, end: Date) {
        self.start = start
        self.end = end
    }

    public var startISO: String {
        CompassDateParsing.formatLikeDayjs(start)
    }

    public var endISO: String {
        CompassDateParsing.formatLikeDayjs(end)
    }
}
