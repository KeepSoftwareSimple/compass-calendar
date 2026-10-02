import CompassKit
import CompassData
import XCTest

final class EventRepositoryTests: XCTestCase {
    func testUpsertIsIdempotent() throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let event = sampleEvent(id: "evt-1", title: "Standup")

        try repository.upsert(events: [event], isLocal: false)
        try repository.upsert(events: [event], isLocal: false)

        let stored = try repository.fetchAll()
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored[0].id.rawValue, "evt-1")
    }

    func testUpsertUpdatesFTSRow() throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let event = sampleEvent(id: "evt-2", title: "Lunch")

        try repository.upsert(events: [event], isLocal: true)

        let matches = try database.writer.read { db in
            try Int.fetchOne(db, sql: """
                SELECT COUNT(*) FROM event_fts WHERE event_fts MATCH 'Lunch'
                """)
        }
        XCTAssertEqual(matches, 1)
    }

    private func sampleEvent(id: String, title: String) -> Event {
        Event(
            calendarId: CalendarId(rawValue: "cal-1"),
            content: .details(
                EventContent_DetailsPayload(
                    attendees: nil,
                    color: nil,
                    colorHex: nil,
                    conference: nil,
                    description: "Notes",
                    kind: "details",
                    location: nil,
                    organizer: nil,
                    title: title
                )
            ),
            createdAt: DateTime(rawValue: "2026-01-01T00:00:00.000Z"),
            icalUid: nil,
            id: EventId(rawValue: id),
            providerManaged: nil,
            recurrence: .single(EventRecurrence_SinglePayload(kind: "single")),
            schedule: .timed(
                EventSchedule_TimedPayload(
                    end: DateTime(rawValue: "2026-01-01T01:00:00.000Z"),
                    kind: "timed",
                    start: DateTime(rawValue: "2026-01-01T00:00:00.000Z"),
                    timeZone: IANATimeZone(rawValue: "UTC")
                )
            ),
            updatedAt: DateTime(rawValue: "2026-01-01T00:00:00.000Z")
        )
    }
}
