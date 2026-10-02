import Foundation

public typealias CalendarLookup = [String: CompassCalendar]

public enum CalendarLookupBuilder {
    public static func build(_ calendars: [CompassCalendar]) -> CalendarLookup {
        Dictionary(uniqueKeysWithValues: calendars.map { ($0.id, $0) })
    }
}

public struct CalendarCardIdentity: Hashable, Sendable, Codable {
    public var backgroundColor: String
    public var name: String

    public init(backgroundColor: String, name: String) {
        self.backgroundColor = backgroundColor
        self.name = name
    }
}

public enum GridEventCardChrome {
    public static func resolveCalendarCardIdentity(
        lookup: CalendarLookup,
        calendarId: String?
    ) -> CalendarCardIdentity? {
        guard let calendarId, lookup.count > 1 else { return nil }
        guard let calendar = lookup[calendarId] else { return nil }
        return CalendarCardIdentity(
            backgroundColor: calendar.backgroundColor,
            name: calendar.name
        )
    }

    public static func resolveCalendarFocusColor(
        lookup: CalendarLookup,
        calendarId: String?
    ) -> String? {
        guard let calendarId else { return nil }
        return lookup[calendarId]?.backgroundColor
    }

    public static func cardFillColorHex(
        lookup: CalendarLookup,
        calendarId: String?,
        eventColorHex: String?
    ) -> String? {
        if let eventColorHex, !eventColorHex.isEmpty {
            return eventColorHex
        }
        return resolveCalendarFocusColor(lookup: lookup, calendarId: calendarId)
    }
}
