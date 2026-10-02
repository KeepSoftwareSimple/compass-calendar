import Foundation
import GRDB

public struct UserMetadataRepository: Sendable {
    private let db: any DatabaseWriter

    public init(database: AppDatabase) {
        self.db = database.writer
    }

    public func upsert(key: String, json: String) throws {
        try db.write { db in
            try UserMetadataRecord(key: key, json: json).save(db, onConflict: .replace)
        }
    }

    public func upsert<T: Encodable>(key: String, value: T) throws {
        let json = try UserMetadataRecordCodec.jsonString(from: value)
        try upsert(key: key, json: json)
    }

    public func fetch(key: String) throws -> String? {
        try db.read { db in
            try UserMetadataRecord.fetchOne(db, key: key)?.json
        }
    }

    public func observe(key: String) -> ValueObservation<ValueReducers.Fetch<String?>> {
        ValueObservation.tracking { db in
            try UserMetadataRecord.fetchOne(db, key: key)?.json
        }
    }
}
