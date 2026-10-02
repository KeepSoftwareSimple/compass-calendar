import CompassKit
import CompassData
import XCTest

final class EventRepositoryTests: XCTestCase {
    func testUpsertIsIdempotent() throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let event = try sampleEvent(id: "evt-1", title: "Standup")

        try repository.upsert(events: [event], isLocal: false)
        try repository.upsert(events: [event], isLocal: false)

        let stored = try repository.fetchAll()
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored[0].id.rawValue, "evt-1")
    }

    func testUpsertUpdatesFTSRow() throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let event = try sampleEvent(id: "evt-2", title: "Lunch")

        try repository.upsert(events: [event], isLocal: true)

        let matches = try database.writer.read { db in
            try Int.fetchOne(db, sql: """
                SELECT COUNT(*) FROM event_fts WHERE event_fts MATCH 'Lunch'
                """)
        }
        XCTAssertEqual(matches, 1)
    }

    private func sampleEvent(id: String, title: String) throws -> Event {
        let json = """
        {
          "id": "\(id)",
          "calendarId": "cal-1",
          "content": {
            "kind": "details",
            "title": "\(title)",
            "description": "Notes"
          },
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-01T00:00:00.000Z",
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "timed",
            "start": "2026-01-01T00:00:00.000Z",
            "end": "2026-01-01T01:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: Event.self)
    }
}
