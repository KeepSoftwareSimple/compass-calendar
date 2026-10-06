import CompassData
import CompassKit
import Foundation

final class MockEventsAPI: EventsAPIProtocol, @unchecked Sendable {
    var listHandler: ((EventListQuery) async throws -> [Event])?
    var createHandler: ((CreateEventInput) async throws -> EventResponseEvent)?
    var replaceHandler: ((EventId, ReplaceEventInput) async throws -> EventResponseEvent)?

    func list(_ query: EventListQuery) async throws -> [Event] {
        try await listHandler?(query) ?? []
    }

    func create(_ input: CreateEventInput) async throws -> EventResponseEvent {
        try await createHandler!(input)
    }

    func replace(id: EventId, input: ReplaceEventInput) async throws -> EventResponseEvent {
        guard let replaceHandler else {
            throw NSError(domain: "MockEventsAPI", code: 0)
        }
        return try await replaceHandler(id, input)
    }

    func delete(id: EventId, scope: EventDeleteScope) async throws {}

    func rsvp(id: EventId, responseStatus: ResponseStatusEnum, scope: String) async throws {}
}

final class MockUserAPI: HiddenEventsRemoteClient, @unchecked Sendable {
    var hiddenIds: [String] = []
    var setHiddenError: Error?

    func hiddenEventIds() async throws -> [String] {
        hiddenIds
    }

    func setHiddenEvents(_ input: SetEventHiddenInput) async throws -> [String] {
        if let setHiddenError { throw setHiddenError }
        if input.hidden {
            if !hiddenIds.contains(input.eventId.rawValue) {
                hiddenIds.append(input.eventId.rawValue)
            }
        } else {
            hiddenIds.removeAll { $0 == input.eventId.rawValue }
        }
        return hiddenIds
    }
}

enum StoreSampleEvents {
    static func timedEvent(id: String, title: String = "Meet") throws -> Event {
        let json = """
        {
          "id": "\(id)",
          "calendarId": "cal-1",
          "content": {
            "kind": "details",
            "title": "\(title)",
            "description": ""
          },
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-01T00:00:00.000Z",
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "timed",
            "start": "2026-01-01T10:00:00.000Z",
            "end": "2026-01-01T11:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: Event.self)
    }

    static func seriesEvent(id: String) throws -> Event {
        let json = """
        {
          "id": "\(id)",
          "calendarId": "cal-1",
          "content": {
            "kind": "details",
            "title": "Series",
            "description": ""
          },
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-01T00:00:00.000Z",
          "recurrence": { "kind": "series", "rules": ["FREQ=WEEKLY"] },
          "schedule": {
            "kind": "timed",
            "start": "2026-01-01T10:00:00.000Z",
            "end": "2026-01-01T11:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: Event.self)
    }

    static func response(from event: Event) throws -> EventResponseEvent {
        let data = try JSONEncoder().encode(event)
        return try JSONDecoder().decode(EventResponseEvent.self, from: data)
    }
}
