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

    public func fetch(id: EventId) throws -> Event? {
        try db.read { db in
            guard let record = try EventRecord.fetchOne(db, key: id.rawValue) else {
                return nil
            }
            return try EventRecordCodec.event(from: record)
        }
    }

    public func occurrences(forSeriesId seriesId: EventId) throws -> [Event] {
        try fetchAll().filter { event in
            if case .occurrence(let payload) = event.recurrence {
                return payload.seriesId == seriesId
            }
            return false
        }
    }

    /// Drop cached remote rows in `[start, end)` that the latest list response no longer includes.
    public func pruneRemoteEvents(
        intersectingStart start: String,
        end: String,
        retaining retained: Set<EventId>
    ) throws {
        let staleIds = try db.read { db -> [EventId] in
            let rows = try EventRecord.fetchAll(db)
            return rows.compactMap { row -> EventId? in
                guard !row.isLocal else { return nil }
                let id = EventId(rawValue: row.id)
                if retained.contains(id) { return nil }
                guard row.startsAt < end, row.endsAt > start else { return nil }
                return id
            }
        }
        try delete(ids: staleIds)
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
