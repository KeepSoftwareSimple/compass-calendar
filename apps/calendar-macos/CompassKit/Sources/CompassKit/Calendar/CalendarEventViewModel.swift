import Foundation

public struct CalendarEventGridInputs: Sendable {
    public var timedEvents: [GridLayoutTimedEventInput]
    public var allDayEvents: [GridLayoutAllDayEventInput]

    public init(
        timedEvents: [GridLayoutTimedEventInput] = [],
        allDayEvents: [GridLayoutAllDayEventInput] = []
    ) {
        self.timedEvents = timedEvents
        self.allDayEvents = allDayEvents
    }
}

/// Assembles grid layout inputs from domain events (web `deriveCalendarEventViewModel`).
public enum CalendarEventViewModel {
    public static let busyEventTitle = "Busy"

    public static func gridInputs(
        from events: [Event],
        hiddenEventIds: Set<String> = [],
        demoEventIds: Set<String> = []
    ) -> CalendarEventGridInputs {
        let scheduled = events.filter(isRenderable)
        let timed = timedInputs(from: scheduled, hiddenEventIds: hiddenEventIds, demoEventIds: demoEventIds)
        let allDay = allDayInputs(from: scheduled, hiddenEventIds: hiddenEventIds, demoEventIds: demoEventIds)
        return CalendarEventGridInputs(timedEvents: timed, allDayEvents: allDay)
    }

    private static func isRenderable(_ event: Event) -> Bool {
        switch event.recurrence {
        case .series:
            return false
        case .occurrence, .single:
            return true
        }
    }

    private static func timedInputs(
        from events: [Event],
        hiddenEventIds: Set<String>,
        demoEventIds: Set<String>
    ) -> [GridLayoutTimedEventInput] {
        events.compactMap { event in
            guard case .timed(let payload) = event.schedule else { return nil }
            guard let start = CompassDateParsing.parseInEffectiveTimeZone(payload.start),
                  let end = CompassDateParsing.parseInEffectiveTimeZone(payload.end)
            else {
                return nil
            }
            guard !DraftNudge.shouldRenderTimedInAllDayRow(start: start, end: end) else {
                return nil
            }
            return GridLayoutTimedEventInput(
                calendarId: event.calendarId.rawValue,
                endDate: payload.end.rawValue,
                eventId: event.id.rawValue,
                startDate: payload.start.rawValue,
                title: displayTitle(for: event)
            )
        }
    }

    private static func allDayInputs(
        from events: [Event],
        hiddenEventIds: Set<String>,
        demoEventIds: Set<String>
    ) -> [GridLayoutAllDayEventInput] {
        var rowInputs: [GridEventRowInput] = []

        for event in events {
            switch event.schedule {
            case .allDay(let payload):
                rowInputs.append(
                    GridEventRowInput(
                        id: event.id.rawValue,
                        startDate: payload.start,
                        endDate: payload.end,
                        row: nil,
                        title: displayTitle(for: event)
                    )
                )
            case .timed(let payload):
                guard let start = CompassDateParsing.parseInEffectiveTimeZone(payload.start),
                      let end = CompassDateParsing.parseInEffectiveTimeZone(payload.end),
                      DraftNudge.shouldRenderTimedInAllDayRow(start: start, end: end)
                else {
                    continue
                }
                let dates = DraftNudge.timedMultiDayToAllDayDates(start: start, end: end)
                rowInputs.append(
                    GridEventRowInput(
                        id: event.id.rawValue,
                        startDate: dates.startDate,
                        endDate: dates.endDate,
                        row: nil,
                        title: displayTitle(for: event)
                    )
                )
            }
        }

        let assigned = AssignEventsToRow.assign(allDayEvents: rowInputs)
        return assigned.allDayEvents.map { row in
            GridLayoutAllDayEventInput(
                calendarId: events.first(where: { $0.id.rawValue == row.id })?.calendarId.rawValue,
                endDate: row.endDate,
                eventId: row.id,
                row: row.row,
                startDate: row.startDate,
                title: row.title
            )
        }
    }

    private static func displayTitle(for event: Event) -> String {
        switch event.content {
        case .busy:
            return busyEventTitle
        case .details(let details):
            return details.title
        }
    }
}
