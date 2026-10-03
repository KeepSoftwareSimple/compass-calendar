import CompassKit
import Foundation

/// Port of `local-event-sync.util.ts`.
public struct LocalEventSync: Sendable {
    private let localEvents: LocalEventRepository
    private let eventsAPI: EventsAPIProtocol
    private let listCalendars: @Sendable () async throws -> [CompassCalendar]

    public init(
        localEvents: LocalEventRepository,
        eventsAPI: EventsAPIProtocol,
        listCalendars: @escaping @Sendable () async throws -> [CompassCalendar]
    ) {
        self.localEvents = localEvents
        self.eventsAPI = eventsAPI
        self.listCalendars = listCalendars
    }

    public func syncLocalEventsToCloud() async throws -> Int {
        let records = try localEvents.fetchAll()
        if records.isEmpty {
            return 0
        }

        let recordsToSync = records.filter { !$0.isDemo }
        if recordsToSync.isEmpty {
            try localEvents.clearAll()
            return 0
        }

        let calendars = try await listCalendars()
        guard let targetCalendar = DefaultTargetCalendar.resolve(calendars: calendars) else {
            return 0
        }

        var synced = 0
        for record in recordsToSync {
            let input = try Self.toCreateInput(record: record, targetCalendarId: targetCalendar.id)
            _ = try await eventsAPI.create(input)
            try localEvents.delete(id: record.id)
            synced += 1
        }

        try localEvents.clearAll()
        return synced
    }

    static func toCreateInput(record: LocalEventRecord, targetCalendarId: String) throws -> CreateEventInput {
        let event = record.event
        let allDay = scheduleIsAllDay(event.schedule)
        let content = try detailsCreateContent(from: event.content)
        let recurrence = try mapRecurrence(event.recurrence, exdates: record.exdates, allDay: allDay)
        let eventId: EventId? = OccurrenceId.looksLikeOccurrenceId(event.id.rawValue) ? nil : event.id

        return CreateEventInput(
            calendarId: CalendarId(rawValue: targetCalendarId),
            content: content,
            id: eventId,
            recurrence: recurrence,
            schedule: event.schedule
        )
    }

    private static func scheduleIsAllDay(_ schedule: EventSchedule) -> Bool {
        switch schedule {
        case .allDay:
            return true
        case .timed:
            return false
        }
    }

    private static func detailsCreateContent(from content: EventContent) throws -> CreateEventInputContent {
        switch content {
        case let .details(payload):
            return CreateEventInputContent(
                color: payload.color,
                description: payload.description,
                kind: payload.kind,
                location: payload.location ?? "",
                title: payload.title
            )
        case .busy:
            throw LocalEventSyncError.unsupportedContentKind
        }
    }

    private static func mapRecurrence(
        _ recurrence: EventRecurrence,
        exdates: [String]?,
        allDay: Bool
    ) throws -> CreateEventInputRecurrence {
        switch recurrence {
        case let .series(payload):
            let rules = payload.rules + exdateLines(exdates: exdates, allDay: allDay)
            return .series(EventRecurrence_SeriesPayload(kind: payload.kind, rules: rules))
        case .single:
            return .single(EventRecurrence_SinglePayload(kind: "single"))
        case .occurrence:
            return .single(EventRecurrence_SinglePayload(kind: "single"))
        }
    }

    private static func exdateLines(exdates: [String]?, allDay: Bool) -> [String] {
        guard let exdates, !exdates.isEmpty else { return [] }
        return exdates.compactMap { date in
            guard let formatted = rruleInstant(from: date, allDay: allDay) else { return nil }
            return "EXDATE:\(formatted)"
        }
    }

    private static func rruleInstant(from date: String, allDay: Bool) -> String? {
        if allDay {
            let normalized = date.count == 10 ? "\(date)T00:00:00.000Z" : date
            return formatRRuleUTC(normalized)
        }
        return formatRRuleUTC(date)
    }

    private static func formatRRuleUTC(_ iso: String) -> String? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: iso)
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime]
            date = formatter.date(from: iso)
        }
        guard let date else { return nil }
        let output = DateFormatter()
        output.locale = Locale(identifier: "en_US_POSIX")
        output.timeZone = TimeZone(secondsFromGMT: 0)
        output.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return output.string(from: date)
    }
}

public enum LocalEventSyncError: Error {
    case unsupportedContentKind
}
