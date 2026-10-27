import CompassKit
import Foundation

public struct DemoSeedFixture: Sendable {
    public struct Row: Sendable {
        public let id: String
        public let event: Event
        public let isDemo: Bool
    }

    public let referenceNow: Date
    public let timeZone: String
    public let calendarId: String
    public let events: [Row]
    public let attendeeAccountEmail: String?

    public static func load(bundle: Bundle = CompassKitResourceBundle.resources) throws -> DemoSeedFixture {
        guard let url = bundle.url(
            forResource: "demo-seed",
            withExtension: "json",
            subdirectory: "Resources/Fixtures"
        ) ?? bundle.url(forResource: "demo-seed", withExtension: "json", subdirectory: "Fixtures")
        else {
            throw DemoSeedFixtureError.missingResource
        }
        let data = try Data(contentsOf: url)
        let document = try JSONDecoder().decode(DemoSeedDocument.self, from: data)
        guard let referenceNow = CompassDateParsing.parseInEffectiveTimeZone(document.referenceNow) else {
            throw DemoSeedFixtureError.invalidReferenceNow
        }
        return DemoSeedFixture(
            referenceNow: referenceNow,
            timeZone: document.timeZone,
            calendarId: document.calendarId,
            events: document.events.map { Row(id: $0.id, event: $0.event, isDemo: $0.isDemo) },
            attendeeAccountEmail: nil
        )
    }

    /// Moves every row so the fixture's reference day lands on `now`'s day in
    /// `timeZone`, keeping wall-clock times. Mirrors web `generateDemoData`,
    /// which seeds relative to today in the browser zone.
    public func rebased(to now: Date, timeZone: TimeZone) -> DemoSeedFixture {
        var source = Calendar(identifier: .gregorian)
        source.timeZone = TimeZone(identifier: self.timeZone) ?? .gmt
        var target = Calendar(identifier: .gregorian)
        target.timeZone = timeZone
        let sourceDay = source.startOfDay(for: referenceNow)
        let targetDay = target.startOfDay(for: now)

        func move(_ date: Date) -> Date {
            let offset = source.dateComponents([.day], from: sourceDay, to: source.startOfDay(for: date)).day ?? 0
            let time = source.dateComponents([.hour, .minute, .second], from: date)
            let day = target.date(byAdding: .day, value: offset, to: targetDay) ?? targetDay
            return target.date(
                bySettingHour: time.hour ?? 0, minute: time.minute ?? 0, second: time.second ?? 0, of: day
            ) ?? day
        }

        let timed = ISO8601DateFormatter()
        timed.formatOptions = [.withInternetDateTime]
        timed.timeZone = timeZone
        let parse = ISO8601DateFormatter()
        let occurrenceStamp = ISO8601DateFormatter()
        occurrenceStamp.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func dayFormatter(_ calendar: Calendar) -> DateFormatter {
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.timeZone = calendar.timeZone
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter
        }
        let sourceDayFormatter = dayFormatter(source)
        let targetDayFormatter = dayFormatter(target)

        let rows = events.map { row -> Row in
            let event = row.event
            var id = row.id
            let schedule: EventSchedule
            switch event.schedule {
            case .timed(let payload):
                guard let start = parse.date(from: payload.start.rawValue),
                    let end = parse.date(from: payload.end.rawValue)
                else { return row }
                let movedStart = move(start)
                schedule = .timed(
                    EventSchedule_TimedPayload(
                        end: DateTime(rawValue: timed.string(from: move(end))),
                        kind: payload.kind,
                        start: DateTime(rawValue: timed.string(from: movedStart)),
                        timeZone: IANATimeZone(rawValue: timeZone.identifier)))
                if case .occurrence(let occurrence) = event.recurrence {
                    id = "\(occurrence.seriesId.rawValue)|\(occurrenceStamp.string(from: movedStart))"
                }
            case .allDay(let payload):
                guard let start = sourceDayFormatter.date(from: payload.start),
                    let end = sourceDayFormatter.date(from: payload.end)
                else {
                    return row
                }
                schedule = .allDay(
                    EventSchedule_AllDayPayload(
                        end: targetDayFormatter.string(from: move(end)),
                        kind: payload.kind,
                        start: targetDayFormatter.string(from: move(start))))
            }
            let moved = Event(
                calendarId: event.calendarId,
                content: event.content,
                createdAt: event.createdAt,
                icalUid: event.icalUid,
                id: EventId(rawValue: id),
                popupReminderMinutes: event.popupReminderMinutes,
                providerManaged: event.providerManaged,
                recurrence: event.recurrence,
                schedule: schedule,
                updatedAt: event.updatedAt)
            return Row(id: id, event: moved, isDemo: row.isDemo)
        }
        return DemoSeedFixture(
            referenceNow: now, timeZone: timeZone.identifier, calendarId: calendarId, events: rows, attendeeAccountEmail: attendeeAccountEmail)
    }

    /// An attendee/occurrence variant exercises RSVP without credentials or network writes.
    public func attendeeVariant() -> DemoSeedFixture {
        let rows = events.map { row -> Row in
            guard row.id == "demo-morning-standup" else { return row }
            let event = row.event
            let occurrence = Event(
                calendarId: event.calendarId, content: event.content, createdAt: event.createdAt,
                icalUid: event.icalUid, id: event.id, popupReminderMinutes: event.popupReminderMinutes,
                providerManaged: event.providerManaged,
                recurrence: .occurrence(.init(kind: "occurrence", seriesId: EventId(rawValue: "demo-rsvp-series"))),
                schedule: event.schedule, updatedAt: event.updatedAt)
            return Row(id: row.id, event: occurrence, isDemo: row.isDemo)
        }
        return DemoSeedFixture(referenceNow: referenceNow, timeZone: timeZone, calendarId: calendarId,
            events: rows, attendeeAccountEmail: "sam@example.com")
    }

    public var demoEventIds: Set<String> {
        Set(events.filter(\.isDemo).map(\.id))
    }

    public func events(inRangeStart start: String, end: String) -> [Event] {
        events.map(\.event).filter { event in
            EventScheduleBounds.intersectsQueryRange(event: event, start: start, end: end)
        }
    }

    public func calendarListItem() -> CompassCalendar {
        CompassCalendar(
            access: .owner,
            accountEmail: attendeeAccountEmail,
            backgroundColor: "#ffffff",
            capabilities: CompassCalendarCapabilities(
                canInviteAttendees: true,
                canManage: true,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: true,
                canWrite: true,
                conferenceKinds: []
            ),
            conference: nil,
            createsGoogleMeet: nil,
            description: "",
            foregroundColor: "#000000",
            id: calendarId,
            isActive: true,
            isPrimary: true,
            isVisible: true,
            name: "Compass",
            provider: "local",
            timeZone: IANATimeZone(rawValue: timeZone)
        )
    }
}

public enum DemoSeedFixtureError: Error, Sendable {
    case missingResource
    case invalidReferenceNow
}

private struct DemoSeedDocument: Decodable {
    struct Row: Decodable {
        let id: String
        let event: Event
        let isDemo: Bool
    }

    let referenceNow: String
    let timeZone: String
    let calendarId: String
    let events: [Row]
}
