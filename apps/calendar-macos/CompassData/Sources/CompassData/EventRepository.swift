import CompassKit
import Foundation
import GRDB

public struct EventRepository: Sendable {
    private let db: any DatabaseWriter

    public init(database: AppDatabase) {
        self.db = database.writer
    }

    public func upsert(events: [Event], isLocal: Bool) throws {
        guard !events.isEmpty else { return }
        try db.write { db in
            for event in events {
                let record = try EventRecordCodec.record(for: event, isLocal: isLocal)
                try record.save(db, onConflict: .replace)
                let search = EventScheduleBounds.searchText(for: event)
                try EventFTS.upsert(
                    db: db,
                    eventId: record.id,
                    title: search.title,
                    description: search.description
                )
            }
        }
    }

    public func delete(ids: [EventId]) throws {
        guard !ids.isEmpty else { return }
        try db.write { db in
            for id in ids {
                try EventRecord.deleteOne(db, key: id.rawValue)
                try EventFTS.delete(db: db, eventId: id.rawValue)
            }
        }
    }

    public func fetchAll() throws -> [Event] {
        try db.read { db in
            try EventRecord.fetchAll(db).map { try EventRecordCodec.event(from: $0) }
        }
    }

    public func observeAll() -> ValueObservation<ValueReducers.Fetch<[Event]>> {
        ValueObservation.tracking { db in
            try EventRecord.fetchAll(db).map { try EventRecordCodec.event(from: $0) }
        }
    }
}
