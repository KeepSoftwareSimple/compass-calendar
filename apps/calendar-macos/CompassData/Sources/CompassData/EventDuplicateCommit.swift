import CompassKit
import Foundation

public enum EventDuplicateCommit {
    public static func duplicateInput(
        from source: Event,
        calendars: [CompassCalendar],
        defaultCalendarId: CalendarId?
    ) -> CreateEventInput? {
        let writableCalendarId: CalendarId? = {
            if let match = calendars.first(where: { $0.id == source.calendarId.rawValue }),
               match.capabilities.canWrite
            {
                return source.calendarId
            }
            return defaultCalendarId
        }()
        guard let calendarId = writableCalendarId else { return nil }

        let recurrence: CreateEventInputRecurrence = switch source.recurrence {
        case .series(let payload):
            .series(EventRecurrence_SeriesPayload(kind: "series", rules: payload.rules))
        default:
            .single(EventRecurrence_SinglePayload(kind: "single"))
        }

        guard case .details(let details) = source.content else { return nil }
        let content = CreateEventInputContent(
            description: details.description ?? "",
            kind: "details",
            location: details.location ?? "",
            title: details.title
        )

        let schedule: EventSchedule = source.schedule
        let newId = GridEventDraftFactory.makeClientEventId()

        return CreateEventInput(
            calendarId: calendarId,
            content: content,
            id: newId,
            recurrence: recurrence,
            schedule: schedule
        )
    }

    public static func optimisticEvent(from input: CreateEventInput) -> Event? {
        guard let id = input.id else { return nil }
        let now = DateTime(rawValue: CompassDateParsing.formatLikeDayjs(Date()))
        let details = input.content
        return Event(
            calendarId: input.calendarId,
            content: .details(
                EventContent_DetailsPayload(
                    description: details.description,
                    kind: "details",
                    location: details.location,
                    title: details.title
                )
            ),
            createdAt: now,
            id: id,
            recurrence: mapRecurrence(input.recurrence),
            schedule: input.schedule,
            updatedAt: now
        )
    }

    private static func mapRecurrence(_ recurrence: CreateEventInputRecurrence) -> EventRecurrence {
        switch recurrence {
        case .series(let payload):
            .series(payload)
        case .single(let payload):
            .single(payload)
        }
    }
}
