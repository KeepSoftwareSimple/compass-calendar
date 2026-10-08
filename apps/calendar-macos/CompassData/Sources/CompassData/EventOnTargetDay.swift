import CompassKit
import Foundation

public enum EventOnTargetDay {
    public static func startDay(for event: Event) -> Date {
        switch event.schedule {
        case .timed(let timed):
            return CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue)
                .map { EffectiveTimeZone.calendar.startOfDay(for: $0) }
                ?? EffectiveTimeZone.calendar.startOfDay(for: Date())
        case .allDay(let allDay):
            return CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.start)
                ?? EffectiveTimeZone.calendar.startOfDay(for: Date())
        }
    }

    public static func moved(_ event: Event, to targetDay: Date) -> Event {
        let calendar = EffectiveTimeZone.calendar
        let sourceDay = calendar.startOfDay(for: startDay(for: event))
        let target = calendar.startOfDay(for: targetDay)
        guard sourceDay != target else { return event }

        let deltaDays = calendar.dateComponents([.day], from: sourceDay, to: target).day ?? 0

        switch event.schedule {
        case .timed(let timed):
            guard
                let start = CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue),
                let end = CompassDateParsing.parseInEffectiveTimeZone(timed.end.rawValue),
                let nextStart = calendar.date(byAdding: .day, value: deltaDays, to: start),
                let nextEnd = calendar.date(byAdding: .day, value: deltaDays, to: end)
            else { return event }
            return Event(
                calendarId: event.calendarId,
                content: event.content,
                createdAt: event.createdAt,
                icalUid: event.icalUid,
                id: event.id,
                providerManaged: event.providerManaged,
                recurrence: event.recurrence,
                schedule: .timed(
                    EventSchedule_TimedPayload(
                        end: DateTime(rawValue: CompassDateParsing.formatLikeDayjs(nextEnd)),
                        kind: "timed",
                        start: DateTime(rawValue: CompassDateParsing.formatLikeDayjs(nextStart)),
                        timeZone: timed.timeZone
                    )
                ),
                updatedAt: event.updatedAt
            )
        case .allDay(let allDay):
            guard
                let start = CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.start),
                let end = CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.end),
                let nextStart = calendar.date(byAdding: .day, value: deltaDays, to: start),
                let nextEnd = calendar.date(byAdding: .day, value: deltaDays, to: end)
            else { return event }
            return Event(
                calendarId: event.calendarId,
                content: event.content,
                createdAt: event.createdAt,
                icalUid: event.icalUid,
                id: event.id,
                providerManaged: event.providerManaged,
                recurrence: event.recurrence,
                schedule: .allDay(
                    EventSchedule_AllDayPayload(
                        end: CompassDateParsing.formatCalendarDay(nextEnd),
                        kind: "allDay",
                        start: CompassDateParsing.formatCalendarDay(nextStart)
                    )
                ),
                updatedAt: event.updatedAt
            )
        }
    }
}
