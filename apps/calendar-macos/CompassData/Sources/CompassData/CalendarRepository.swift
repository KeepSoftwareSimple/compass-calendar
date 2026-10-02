import CompassKit
import Foundation
import GRDB

public struct CalendarRepository: Sendable {
    private let db: any DatabaseWriter

    public init(database: AppDatabase) {
        self.db = database.writer
    }

    public func upsert(calendars: [CompassCalendar]) throws {
        guard !calendars.isEmpty else { return }
        try db.write { db in
            for calendar in calendars {
                let record = try CalendarRecordCodec.record(for: calendar)
                try record.save(db, onConflict: .replace)
            }
        }
    }

    public func fetchAll() throws -> [CompassCalendar] {
        try db.read { db in
            try CalendarRecord.fetchAll(db).map { try CalendarRecordCodec.calendar(from: $0) }
        }
    }

    public func observeAll() -> ValueObservation<ValueReducers.Fetch<[CompassCalendar]>> {
        ValueObservation.tracking { db in
            try CalendarRecord.fetchAll(db).map { try CalendarRecordCodec.calendar(from: $0) }
        }
    }
}
