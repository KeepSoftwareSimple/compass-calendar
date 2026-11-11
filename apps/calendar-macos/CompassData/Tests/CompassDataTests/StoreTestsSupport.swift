import CompassData
import CompassKit
import Foundation

final class MockEventsAPI: EventsAPIProtocol, @unchecked Sendable {
    var listHandler: ((EventListQuery) async throws -> [Event])?
    var createHandler: ((CreateEventInput) async throws -> EventResponseEvent)?
    var replaceHandler: ((EventId, ReplaceEventInput) async throws -> EventResponseEvent)?
    var deleteHandler: ((EventId, EventDeleteScope) async throws -> Void)?
    private(set) var lastReplaceScope: ScopeEnum?
    private(set) var lastDeleteScope: EventDeleteScope?

    func list(_ query: EventListQuery) async throws -> [Event] {
        try await listHandler?(query) ?? []
    }

    func create(_ input: CreateEventInput) async throws -> EventResponseEvent {
        try await createHandler!(input)
    }

    func replace(id: EventId, input: ReplaceEventInput) async throws -> EventResponseEvent {
        lastReplaceScope = input.scope
        guard let replaceHandler else {
            throw NSError(domain: "MockEventsAPI", code: 0)
        }
        return try await replaceHandler(id, input)
    }

    func delete(id: EventId, scope: EventDeleteScope) async throws {
        lastDeleteScope = scope
        if let deleteHandler {
            try await deleteHandler(id, scope)
        }
    }

    func resetRecordedScopes() {
        lastReplaceScope = nil
        lastDeleteScope = nil
    }

    func rsvp(id: EventId, responseStatus: ResponseStatusEnum, scope: String) async throws {}
}

final class MockUserAPI: HiddenEventsRemoteClient, @unchecked Sendable {
    var hiddenIds: [String] = []
    var setHiddenError: Error?
    var setHiddenHandler: ((SetEventHiddenInput) async throws -> [String])?

    func hiddenEventIds() async throws -> [String] {
        hiddenIds
    }

    func setHiddenEvents(_ input: SetEventHiddenInput) async throws -> [String] {
        if let setHiddenHandler {
            return try await setHiddenHandler(input)
        }
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

struct AsyncTestCoordinationTimeout: Error {}

actor AsyncTestGate {
    private var continuation: CheckedContinuation<Void, Never>?

    func wait() async {
        await withCheckedContinuation { continuation = $0 }
    }

    func waitForTest(timeout seconds: Double = 10) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { await self.wait() }
            group.addTask {
                try await Task.sleep(for: .seconds(seconds))
                throw AsyncTestCoordinationTimeout()
            }
            _ = try await group.next()
            group.cancelAll()
        }
    }

    func resume() {
        continuation?.resume()
        continuation = nil
    }
}

/// One-shot signal that tolerates `signal()` before `wait()`.
actor AsyncTestSignal {
    private var signaled = false
    private var continuation: CheckedContinuation<Void, Never>?

    func signal() {
        signaled = true
        continuation?.resume()
        continuation = nil
    }

    func wait() async {
        if signaled { return }
        await withCheckedContinuation { continuation = $0 }
    }

    func waitForTest(timeout seconds: Double = 10) async throws {
        if signaled { return }
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { await self.wait() }
            group.addTask {
                try await Task.sleep(for: .seconds(seconds))
                throw AsyncTestCoordinationTimeout()
            }
            _ = try await group.next()
            group.cancelAll()
        }
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
