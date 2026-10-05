import CompassKit
import Foundation

public enum GridEventDraftKind: String, Sendable, Equatable {
    case create
    case edit
}

/// Mirrors `apps/calendar-web/src/events/event-draft.types.ts` (grid draft path).
public struct GridEventDraft: Sendable, Equatable {
    public var kind: GridEventDraftKind
    public var calendarId: CalendarId?
    public var clientId: EventId
    /// Set for `edit` drafts (the persisted event being edited).
    public var sourceEventId: EventId?
    public var schedule: DraftSchedule
    public var title: String
    public var color: EventColorSlot?
    public var description: String
    public var location: String

    public init(
        kind: GridEventDraftKind = .create,
        clientId: EventId,
        schedule: DraftSchedule,
        title: String = "",
        calendarId: CalendarId? = nil,
        sourceEventId: EventId? = nil,
        color: EventColorSlot? = nil,
        description: String = "",
        location: String = ""
    ) {
        self.kind = kind
        self.clientId = clientId
        self.schedule = schedule
        self.title = title
        self.calendarId = calendarId
        self.sourceEventId = sourceEventId
        self.color = color
        self.description = description
        self.location = location
    }

    public var persistedEventId: EventId? {
        switch kind {
        case .create: return nil
        case .edit: return sourceEventId ?? clientId
        }
    }
}

public enum GridEventDraftFactory {
    public static func makeClientEventId() -> EventId {
        let hex = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        return EventId(rawValue: String(hex.prefix(24)))
    }
}
