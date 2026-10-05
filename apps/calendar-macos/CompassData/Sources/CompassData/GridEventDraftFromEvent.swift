import CompassKit
import Foundation

public enum GridEventDraftFromEvent {
    public static func editDraft(from event: Event) -> GridEventDraft? {
        guard let schedule = draftSchedule(from: event.schedule) else { return nil }
        let details = eventDetails(from: event)
        return GridEventDraft(
            kind: .edit,
            clientId: event.id,
            schedule: schedule,
            title: details.title,
            calendarId: event.calendarId,
            sourceEventId: event.id,
            color: details.color,
            description: details.description,
            location: details.location,
            recurrence: .preserve
        )
    }

    public static func duplicateDraft(
        from event: Event,
        calendars: [CompassCalendar]
    ) -> GridEventDraft? {
        guard let schedule = draftSchedule(from: event.schedule) else { return nil }
        let details = eventDetails(from: event)
        let sourceCalendar = calendars.first { $0.id == event.calendarId.rawValue }
        let calendarId: CalendarId? =
            sourceCalendar?.capabilities.canWrite == true ? event.calendarId : nil
        return GridEventDraft(
            kind: .create,
            clientId: GridEventDraftFactory.makeClientEventId(),
            schedule: schedule,
            title: details.title,
            calendarId: calendarId,
            color: details.color,
            description: details.description,
            location: details.location
        )
    }

    private static func eventDetails(from event: Event) -> (
        title: String,
        description: String,
        location: String,
        color: EventColorSlot?
    ) {
        switch event.content {
        case .busy:
            return (CalendarEventViewModel.busyEventTitle, "", "", nil)
        case .details(let payload):
            let color: EventColorSlot? = payload.color.flatMap { EventColorSlot(rawValue: $0.rawValue) }
            return (
                payload.title,
                payload.description,
                payload.location ?? "",
                color
            )
        }
    }

    private static func draftSchedule(from schedule: EventSchedule) -> DraftSchedule? {
        switch schedule {
        case .timed(let timed):
            guard let start = CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue),
                let end = CompassDateParsing.parseInEffectiveTimeZone(timed.end.rawValue)
            else { return nil }
            return DraftSchedule(start: start, end: end, kind: .timed)
        case .allDay(let allDay):
            guard let start = CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.start),
                let end = CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.end)
            else { return nil }
            return DraftSchedule(start: start, end: end, kind: .allDay)
        }
    }
}
