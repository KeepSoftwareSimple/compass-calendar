import CompassData
import CompassKit
import XCTest

@MainActor
final class EventsStoreRecurringTests: XCTestCase {
    func testLoadRangePrunesSupersededOccurrenceRows() async throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let rangeCache = RangeCache(database: database)
        let localEvents = LocalEventRepository(database: database)
        let mockAPI = MockEventsAPI()
        let store = EventsStore(
            repository: repository,
            localEvents: localEvents,
            rangeCache: rangeCache,
            eventsAPI: mockAPI
        )

        let key = EventRangeQueryKey(
            scope: .week,
            source: .remote,
            start: "2026-07-01T00:00:00.000Z",
            end: "2026-07-08T00:00:00.000Z"
        )

        let stale = try occurrence(id: "series|2026-07-06T16:00:00.000Z", day: 6)
        let replacement = try occurrence(id: "remainder-series", day: 6, title: "Updated")
        try repository.upsert(events: [stale], isLocal: false)

        mockAPI.listHandler = { _ in
            [try StoreSampleEvents.response(from: replacement)]
        }

        _ = try await store.loadRange(key: key)

        let stored = try repository.fetchAll()
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored[0].id.rawValue, "remainder-series")
    }

    func testReplaceOptimisticThisAndFollowingAppliesProjection() async throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let rangeCache = RangeCache(database: database)
        let localEvents = LocalEventRepository(database: database)
        let mockAPI = MockEventsAPI()
        let store = EventsStore(
            repository: repository,
            localEvents: localEvents,
            rangeCache: rangeCache,
            eventsAPI: mockAPI
        )

        EffectiveTimeZone.identifier = "UTC"
        let seriesId = EventId(rawValue: "664e21f9a6b3f0b1c2d3e4f5")
        let master = try seriesMaster(id: seriesId)
        let first = try occurrence(
            id: "\(seriesId.rawValue)|2026-07-05T16:00:00.000Z",
            day: 5,
            seriesId: seriesId
        )
        let split = try occurrence(
            id: "\(seriesId.rawValue)|2026-07-06T16:00:00.000Z",
            day: 6,
            seriesId: seriesId
        )
        let following = try occurrence(
            id: "\(seriesId.rawValue)|2026-07-07T16:00:00.000Z",
            day: 7,
            seriesId: seriesId
        )
        try repository.upsert(events: [master, first, split, following], isLocal: false)

        let edited = copyEvent(
            split,
            content: .details(.init(description: "", kind: "details", title: "Moved title"))
        )
        let input = try replaceInput(scope: .thisAndFollowing)

        mockAPI.replaceHandler = { _, _ in
            try StoreSampleEvents.response(from: edited)
        }

        try await store.replaceOptimistic(id: split.id, input: input, optimisticEvent: edited)

        let stored = try repository.fetchAll()
        let ids = Set(stored.map(\.id.rawValue))
        // Web parity: remainderSeriesId is edited.id (same as the split occurrence id).
        XCTAssertFalse(ids.contains(following.id.rawValue))
        XCTAssertTrue(ids.contains(seriesId.rawValue))
        XCTAssertTrue(ids.contains(edited.id.rawValue))
        XCTAssertEqual(stored.filter { $0.id == edited.id }.count, 1)

        let gridInputs = CalendarEventViewModel.gridInputs(from: stored)
        let julySix = gridInputs.timedEvents.filter { $0.startDate.hasPrefix("2026-07-06T16:00:00") }
        XCTAssertEqual(julySix.count, 1)
    }

    func testDeleteOptimisticMapsScopeToQuery() async throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let rangeCache = RangeCache(database: database)
        let localEvents = LocalEventRepository(database: database)
        let mockAPI = MockEventsAPI()
        let store = EventsStore(
            repository: repository,
            localEvents: localEvents,
            rangeCache: rangeCache,
            eventsAPI: mockAPI
        )

        let seriesId = EventId(rawValue: "demo-weekly-sync")
        let master = try seriesMaster(id: seriesId)
        let first = try occurrence(
            id: "\(seriesId.rawValue)|2026-06-10T14:00:00.000Z",
            day: 10,
            seriesId: seriesId
        )
        let second = try occurrence(
            id: "\(seriesId.rawValue)|2026-06-12T14:00:00.000Z",
            day: 12,
            seriesId: seriesId
        )
        try repository.upsert(events: [master, first, second], isLocal: false)

        try await store.deleteOptimistic(id: second.id, scope: .thisAndFollowing)
        XCTAssertEqual(mockAPI.lastDeleteScope, .thisAndFollowing)

        mockAPI.resetRecordedScopes()
        try await store.deleteOptimistic(id: first.id, scope: .all)
        XCTAssertEqual(mockAPI.lastDeleteScope, .all)
    }

    func testLocalReplaceThisAndFollowingAppliesProjection() async throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let rangeCache = RangeCache(database: database)
        let localEvents = LocalEventRepository(database: database)
        let mockAPI = MockEventsAPI()
        let store = EventsStore(
            repository: repository,
            localEvents: localEvents,
            rangeCache: rangeCache,
            eventsAPI: mockAPI,
            source: .local
        )

        EffectiveTimeZone.identifier = "UTC"
        let seriesId = EventId(rawValue: "demo-weekly-sync")
        let master = try seriesMaster(id: seriesId)
        let first = try occurrence(
            id: "\(seriesId.rawValue)|2026-06-10T14:00:00.000Z",
            day: 10,
            seriesId: seriesId
        )
        let split = try occurrence(
            id: "\(seriesId.rawValue)|2026-06-12T14:00:00.000Z",
            day: 12,
            seriesId: seriesId
        )
        let following = try occurrence(
            id: "\(seriesId.rawValue)|2026-06-17T14:00:00.000Z",
            day: 17,
            seriesId: seriesId
        )
        try localEvents.putMany([
            LocalEventRecord(id: master.id, event: master, isDemo: true),
            LocalEventRecord(id: first.id, event: first, isDemo: true),
            LocalEventRecord(id: split.id, event: split, isDemo: true),
            LocalEventRecord(id: following.id, event: following, isDemo: true),
        ])

        let edited = copyEvent(
            split,
            content: .details(.init(description: "", kind: "details", title: "Split weekly sync"))
        )
        let input = try replaceInput(scope: .thisAndFollowing)
        try await store.replaceOptimistic(id: split.id, input: input, optimisticEvent: edited)

        let stored = try localEvents.fetchAll().map(\.event)
        let titleById = Dictionary(uniqueKeysWithValues: stored.map { ($0.id.rawValue, eventTitle($0)) })
        XCTAssertEqual(titleById[first.id.rawValue], "Series")
        XCTAssertEqual(titleById[split.id.rawValue], "Split weekly sync")
        XCTAssertEqual(titleById[following.id.rawValue], "Split weekly sync")
    }

    func testReplaceOptimisticMapsThisScopeToQuery() async throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let rangeCache = RangeCache(database: database)
        let localEvents = LocalEventRepository(database: database)
        let mockAPI = MockEventsAPI()
        let store = EventsStore(
            repository: repository,
            localEvents: localEvents,
            rangeCache: rangeCache,
            eventsAPI: mockAPI
        )

        let seriesId = EventId(rawValue: "664e21f9a6b3f0b1c2d3e4f5")
        let split = try occurrence(
            id: "\(seriesId.rawValue)|2026-06-06T16:00:00.000Z",
            day: 6,
            seriesId: seriesId
        )
        try repository.upsert(events: [split], isLocal: false)
        let input = try replaceInput(scope: .this)
        try await store.replaceOptimistic(id: split.id, input: input, optimisticEvent: split)
        XCTAssertEqual(mockAPI.lastReplaceScope, .this)
    }

    private func seriesMaster(id: EventId) throws -> Event {
        let json = """
        {
          "id": "\(id.rawValue)",
          "calendarId": "cal-1",
          "content": { "kind": "details", "title": "Series", "description": "" },
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "series", "rules": ["RRULE:FREQ=DAILY"] },
          "schedule": {
            "kind": "timed",
            "start": "2026-07-01T16:00:00.000Z",
            "end": "2026-07-01T17:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: Event.self)
    }

    private func occurrence(id: String, day: Int, seriesId: EventId? = nil, title: String = "Series") throws -> Event {
        let sid = seriesId?.rawValue ?? "series"
        let json = """
        {
          "id": "\(id)",
          "calendarId": "cal-1",
          "content": { "kind": "details", "title": "\(title)", "description": "" },
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "occurrence", "seriesId": "\(sid)" },
          "schedule": {
            "kind": "timed",
            "start": "2026-07-\(String(format: "%02d", day))T16:00:00.000Z",
            "end": "2026-07-\(String(format: "%02d", day))T17:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: Event.self)
    }

    private func replaceInput(scope: ScopeEnum) throws -> ReplaceEventInput {
        let json = """
        {
          "content": {
            "kind": "details",
            "title": "Moved title",
            "description": "",
            "location": ""
          },
          "recurrence": { "kind": "preserve" },
          "schedule": {
            "kind": "timed",
            "start": "2026-07-06T16:00:00.000Z",
            "end": "2026-07-06T17:00:00.000Z",
            "timeZone": "UTC"
          },
          "scope": "\(scope.rawValue)"
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: ReplaceEventInput.self)
    }

    private func eventTitle(_ event: Event) -> String {
        switch event.content {
        case .busy:
            return CalendarEventViewModel.busyEventTitle
        case .details(let payload):
            return payload.title
        }
    }

    private func copyEvent(_ event: Event, content: EventContent) -> Event {
        Event(
            calendarId: event.calendarId,
            content: content,
            createdAt: event.createdAt,
            icalUid: event.icalUid,
            id: event.id,
            providerManaged: event.providerManaged,
            recurrence: event.recurrence,
            schedule: event.schedule,
            updatedAt: event.updatedAt
        )
    }
}
