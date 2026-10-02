import CompassKit
import Foundation
import GRDB

public enum AppDatabaseError: Error {
    case migrationFailed(String)
}

/// Local GRDB cache (SQLite) for calendars, events, ranges, and metadata.
public struct AppDatabase: Sendable {
    public let writer: any DatabaseWriter

    public init(_ writer: any DatabaseWriter) {
        self.writer = writer
    }

    public static func inMemory() throws -> AppDatabase {
        let queue = try DatabaseQueue()
        let database = AppDatabase(queue)
        try database.migrate()
        return database
    }

    public func migrate() throws {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1") { db in
            try db.create(table: "event") { table in
                table.column("id", .text).primaryKey()
                table.column("calendarId", .text).notNull()
                table.column("startsAt", .text).notNull()
                table.column("endsAt", .text).notNull()
                table.column("allDay", .boolean).notNull()
                table.column("isLocal", .boolean).notNull()
                table.column("updatedAt", .text)
                table.column("json", .text).notNull()
            }

            try db.create(table: "calendar") { table in
                table.column("id", .text).primaryKey()
                table.column("json", .text).notNull()
            }

            try db.create(table: "hidden_event") { table in
                table.column("eventId", .text).primaryKey()
            }

            try db.create(table: "loaded_range") { table in
                table.column("source", .text).notNull()
                table.column("start", .text).notNull()
                table.column("end", .text).notNull()
                table.column("fetchedAt", .double).notNull()
                table.primaryKey(["source", "start", "end"])
            }

            try db.create(table: "user_metadata") { table in
                table.column("key", .text).primaryKey()
                table.column("json", .text).notNull()
            }

            try db.execute(sql: """
                CREATE VIRTUAL TABLE event_fts USING fts5(
                    eventId UNINDEXED,
                    title,
                    description
                );
                """)
        }

        try migrator.migrate(writer)
    }
}

struct EventRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "event"

    var id: String
    var calendarId: String
    var startsAt: String
    var endsAt: String
    var allDay: Bool
    var isLocal: Bool
    var updatedAt: String?
    var json: String
}

struct CalendarRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "calendar"

    var id: String
    var json: String
}

struct HiddenEventRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "hidden_event"

    var eventId: String
}

struct LoadedRangeRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "loaded_range"

    var source: String
    var start: String
    var end: String
    var fetchedAt: TimeInterval
}

struct UserMetadataRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "user_metadata"

    var key: String
    var json: String
}

enum EventRecordCodec {
    private static let encoder = JSONEncoder()
    private static let decoder = JSONDecoder()

    static func record(for event: Event, isLocal: Bool) throws -> EventRecord {
        let bounds = EventScheduleBounds.bounds(for: event)
        let jsonData = try encoder.encode(event)
        let json = String(decoding: jsonData, as: UTF8.self)
        return EventRecord(
            id: event.id.rawValue,
            calendarId: event.calendarId.rawValue,
            startsAt: bounds.startsAt,
            endsAt: bounds.endsAt,
            allDay: bounds.allDay,
            isLocal: isLocal,
            updatedAt: event.updatedAt?.rawValue,
            json: json
        )
    }

    static func event(from record: EventRecord) throws -> Event {
        let data = Data(record.json.utf8)
        return try decoder.decode(Event.self, from: data)
    }
}

enum CalendarRecordCodec {
    private static let encoder = JSONEncoder()
    private static let decoder = JSONDecoder()

    static func record(for calendar: CompassCalendar) throws -> CalendarRecord {
        let jsonData = try encoder.encode(calendar)
        let json = String(decoding: jsonData, as: UTF8.self)
        return CalendarRecord(id: calendar.id, json: json)
    }

    static func calendar(from record: CalendarRecord) throws -> CompassCalendar {
        let data = Data(record.json.utf8)
        return try decoder.decode(CompassCalendar.self, from: data)
    }
}

enum UserMetadataRecordCodec {
    static func jsonString(from value: some Encodable) throws -> String {
        let data = try JSONEncoder().encode(value)
        return String(decoding: data, as: UTF8.self)
    }
}

enum EventFTS {
    static func upsert(db: Database, eventId: String, title: String, description: String) throws {
        try db.execute(
            sql: "DELETE FROM event_fts WHERE eventId = ?",
            arguments: [eventId]
        )
        try db.execute(
            sql: "INSERT INTO event_fts (eventId, title, description) VALUES (?, ?, ?)",
            arguments: [eventId, title, description]
        )
    }

    static func delete(db: Database, eventId: String) throws {
        try db.execute(
            sql: "DELETE FROM event_fts WHERE eventId = ?",
            arguments: [eventId]
        )
    }
}
