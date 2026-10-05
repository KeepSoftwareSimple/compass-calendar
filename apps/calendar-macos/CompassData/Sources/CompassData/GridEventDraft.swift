import CompassKit
import Foundation

/// Mirrors `apps/calendar-web/src/events/event-draft.types.ts` (create path only).
public struct GridEventDraft: Sendable, Equatable {
    public var calendarId: CalendarId?
    public var clientId: EventId
    public var schedule: DraftSchedule
    public var title: String

    public init(
        clientId: EventId,
        schedule: DraftSchedule,
        title: String = "",
        calendarId: CalendarId? = nil
    ) {
        self.clientId = clientId
        self.schedule = schedule
        self.title = title
        self.calendarId = calendarId
    }
}

public enum GridEventDraftFactory {
    public static func makeClientEventId() -> EventId {
        let hex = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        return EventId(rawValue: String(hex.prefix(24)))
    }
}
