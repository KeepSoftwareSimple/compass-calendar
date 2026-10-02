import Foundation

public struct AllDayDraftSchedule: Sendable {
    public enum Kind: Sendable {
        case allDay
        case timed
    }

    public var kind: Kind
    public var start: Date
    public var end: Date

    public init(kind: Kind, start: Date, end: Date) {
        self.kind = kind
        self.start = start
        self.end = end
    }
}

public struct AllDayDraftEvent: Sendable {
    public var id: String
    public var startDate: String
    public var endDate: String
    public var row: Int?
    public var title: String
    public var isAllDay: Bool
    public var isTimedMultiDayDisplay: Bool

    public init(
        id: String,
        startDate: String,
        endDate: String,
        row: Int? = nil,
        title: String,
        isAllDay: Bool,
        isTimedMultiDayDisplay: Bool = false
    ) {
        self.id = id
        self.startDate = startDate
        self.endDate = endDate
        self.row = row
        self.title = title
        self.isAllDay = isAllDay
        self.isTimedMultiDayDisplay = isTimedMultiDayDisplay
    }
}

public enum AllDayDraftPosition {
    public static func isDraftRenderedInAllDayRow(_ draft: AllDayDraftSchedule) -> Bool {
        switch draft.kind {
        case .allDay:
            return true
        case .timed:
            return DraftNudge.shouldRenderTimedInAllDayRow(start: draft.start, end: draft.end)
        }
    }

    public static func draftToAllDayRowGridEvent(
        id: String,
        title: String,
        draft: AllDayDraftSchedule
    ) -> AllDayDraftEvent {
        switch draft.kind {
        case .allDay:
            return AllDayDraftEvent(
                id: id,
                startDate: CompassDateParsing.formatCalendarDay(draft.start),
                endDate: CompassDateParsing.formatCalendarDay(draft.end),
                title: title,
                isAllDay: true
            )
        case .timed:
            let dates = DraftNudge.timedMultiDayToAllDayDates(start: draft.start, end: draft.end)
            return AllDayDraftEvent(
                id: id,
                startDate: dates.startDate,
                endDate: dates.endDate,
                title: title,
                isAllDay: true,
                isTimedMultiDayDisplay: true
            )
        }
    }

    public static func positionAllDayDraftEvent(
        draftId: String?,
        draft: AllDayDraftSchedule?,
        title: String,
        events: [AllDayDraftEvent]
    ) -> (activeDraftEvent: AllDayDraftEvent?, events: [AllDayDraftEvent]) {
        guard let draft, isDraftRenderedInAllDayRow(draft) else {
            return (nil, events)
        }

        let draftEvent = draftToAllDayRowGridEvent(
            id: draftId ?? "draft",
            title: title,
            draft: draft
        )
        let existingIndex = draftId.flatMap { id in events.firstIndex(where: { $0.id == id }) }

        var eventForRows = draftEvent
        if let existingIndex {
            eventForRows.row = events[existingIndex].row
        }

        var eventsWithDraft = events
        if let existingIndex {
            eventsWithDraft[existingIndex] = eventForRows
        } else {
            eventsWithDraft.append(eventForRows)
        }

        let rowInputs = eventsWithDraft.map {
            GridEventRowInput(
                id: $0.id,
                startDate: $0.startDate,
                endDate: $0.endDate,
                row: $0.row,
                title: $0.title
            )
        }
        let positioned = AssignEventsToRow.assign(allDayEvents: rowInputs).allDayEvents
        let positionedEvents = zip(eventsWithDraft, positioned).map { original, row in
            AllDayDraftEvent(
                id: original.id,
                startDate: original.startDate,
                endDate: original.endDate,
                row: row.row,
                title: original.title,
                isAllDay: original.isAllDay,
                isTimedMultiDayDisplay: original.isTimedMultiDayDisplay
            )
        }

        let activeIndex = existingIndex ?? positionedEvents.count - 1
        let active = positionedEvents.indices.contains(activeIndex) ? positionedEvents[activeIndex] : nil
        return (active, positionedEvents)
    }
}
