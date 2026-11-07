import CompassKit
import Foundation

public enum GridEventDraftFromEvent {
    public static func editDraft(from event: Event) -> GridEventDraft? {
        guard let schedule = draftSchedule(from: event.schedule) else { return nil }
        let details = eventDetails(from: event)
        let attendees: [DraftAttendeeInput]?
        if case .details(let payload) = event.content {
            attendees = payload.attendees?.map { .init(email: $0.email, displayName: $0.displayName) }
        } else {
            attendees = nil
        }
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
            recurrence: .preserve,
            attendees: attendees,
            timeZone: timeZone(from: event.schedule)
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
        let recurrence: GridEventRecurrenceDraft
        if case .series(let series) = event.recurrence {
            recurrence = .series(rules: series.rules)
        } else {
            recurrence = .single
        }
        return GridEventDraft(
            kind: .create,
            clientId: GridEventDraftFactory.makeClientEventId(),
            schedule: schedule,
            title: details.title,
            calendarId: calendarId,
            color: details.color,
            description: details.description,
            location: details.location,
            recurrence: recurrence,
            timeZone: timeZone(from: event.schedule)
        )
    }

    private static func timeZone(from schedule: EventSchedule) -> IANATimeZone? {
        if case .timed(let timed) = schedule { return timed.timeZone }
        return nil
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

    public static func draftSchedule(from event: Event) -> DraftSchedule? {
        draftSchedule(from: event.schedule)
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
