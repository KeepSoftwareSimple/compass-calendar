import CompassData
import CompassKit
import XCTest

@MainActor
final class EventsStoreTests: XCTestCase {
    func testOptimisticCreateThenSettleInvalidatesRange() async throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let localEvents = LocalEventRepository(database: database)
        let rangeCache = RangeCache(database: database)
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
            start: "2026-01-01T00:00:00.000Z",
            end: "2026-01-08T00:00:00.000Z"
        )
        try rangeCache.markLoaded(key: key)
        if case .missing = try store.coverage(for: key) {
            XCTFail("expected loaded range before mutation")
        }

        let optimistic = try StoreSampleEvents.timedEvent(id: "evt-new", title: "New")
        let input = try makeCreateInput(from: optimistic)

        mockAPI.createHandler = { _ in
            try StoreSampleEvents.response(from: optimistic)
        }

        try await store.createOptimistic(input: input, optimisticEvent: optimistic)

        let coverage = try store.coverage(for: key)
        if case .missing = coverage {
            // expected after settle invalidation
        } else {
            XCTFail("expected range invalidation after mutation settle, got \(coverage)")
        }
    }

    private func makeCreateInput(from event: Event) throws -> CreateEventInput {
        _ = event
        let json = """
        {
          "calendarId": "cal-1",
          "content": {
            "kind": "details",
            "title": "New",
            "description": "",
            "location": ""
          },
          "id": "evt-new",
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "timed",
            "start": "2026-01-01T10:00:00.000Z",
            "end": "2026-01-01T11:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: CreateEventInput.self)
    }
}
