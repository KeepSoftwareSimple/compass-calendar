import CompassKit
import Foundation
import GRDB

public struct HiddenEventRepository: Sendable {
    private let db: any DatabaseWriter

    public init(database: AppDatabase) {
        self.db = database.writer
    }

    public func replaceAll(eventIds: [EventId]) throws {
        try db.write { db in
            try HiddenEventRecord.deleteAll(db)
            for id in eventIds {
                try HiddenEventRecord(eventId: id.rawValue).insert(db)
            }
        }
    }

    public func fetchAll() throws -> [EventId] {
        try db.read { db in
            try HiddenEventRecord.fetchAll(db).map { EventId(rawValue: $0.eventId) }
        }
    }

    public func observeAll() -> ValueObservation<ValueReducers.Fetch<[EventId]>> {
        ValueObservation.tracking { db in
            try HiddenEventRecord.fetchAll(db).map { EventId(rawValue: $0.eventId) }
        }
    }
}
