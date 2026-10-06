import CompassKit
import Foundation
import GRDB

public struct LocalEventRepository: Sendable {
    private let db: any DatabaseWriter

    public init(database: AppDatabase) {
        self.db = database.writer
    }

    public func fetchAll() throws -> [LocalEventRecord] {
        try db.read { db in
            try LocalEventRow.fetchAll(db).map { try LocalEventRowCodec.record(from: $0) }
        }
    }

    public func put(_ record: LocalEventRecord) throws {
        try db.write { db in
            let row = try LocalEventRowCodec.row(for: record)
            try row.save(db, onConflict: .replace)
        }
    }

    public func putMany(_ records: [LocalEventRecord]) throws {
        guard !records.isEmpty else { return }
        try db.write { db in
            for record in records {
                let row = try LocalEventRowCodec.row(for: record)
                try row.save(db, onConflict: .replace)
            }
        }
    }

    public func delete(id: EventId) throws {
        try delete(ids: [id])
    }

    public func delete(ids: [EventId]) throws {
        guard !ids.isEmpty else { return }
        try db.write { db in
            for id in ids {
                try LocalEventRow.deleteOne(db, key: id.rawValue)
            }
        }
    }

    public func clearAll() throws {
        try db.write { db in
            try LocalEventRow.deleteAll(db)
        }
    }

    public func events(
        intersectingStart start: String,
        end: String
    ) throws -> [Event] {
        try fetchAll()
            .map(\.event)
            .filter { EventScheduleBounds.intersectsQueryRange(event: $0, start: start, end: end) }
    }

    public func demoEventIds() throws -> Set<String> {
        Set(try fetchAll().filter(\.isDemo).map { $0.id.rawValue })
    }
}

struct LocalEventRow: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "local_event"

    var id: String
    var json: String
}

enum LocalEventRowCodec {
    private static let encoder = JSONEncoder()
    private static let decoder = JSONDecoder()

    static func row(for record: LocalEventRecord) throws -> LocalEventRow {
        let data = try encoder.encode(record)
        let json = String(decoding: data, as: UTF8.self)
        return LocalEventRow(id: record.id.rawValue, json: json)
    }

    static func record(from row: LocalEventRow) throws -> LocalEventRecord {
        let data = Data(row.json.utf8)
        return try decoder.decode(LocalEventRecord.self, from: data)
    }
}
