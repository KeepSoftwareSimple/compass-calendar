import Foundation
import GRDB

/// Event read source, matching the web `EventRepositorySource`.
public enum EventRepositorySource: String, Sendable, Codable {
    case local
    case remote
}

public enum EventQueryScope: String, Sendable, Codable {
    case day
    case week
}

/// TanStack Query key shape: `["events", "day"|"week", { source, start, end }]`.
public struct EventRangeQueryKey: Hashable, Sendable, Codable {
    public let scope: EventQueryScope
    public let source: EventRepositorySource
    public let start: String
    public let end: String

    public init(scope: EventQueryScope, source: EventRepositorySource, start: String, end: String) {
        self.scope = scope
        self.source = source
        self.start = start
        self.end = end
    }

    public var loadedRangeSource: String {
        "\(scope.rawValue):\(source.rawValue)"
    }
}

public enum RangeCoverage: Equatable, Sendable {
    case missing
    case stale(fetchedAt: Date)
    case fresh(fetchedAt: Date)
}

public struct RangeCache: Sendable {
    /// Web parity: `EVENT_QUERY_CACHE_OPTIONS.staleTime` (2 minutes).
    public static let defaultStaleInterval: TimeInterval = 2 * 60

    private let db: any DatabaseWriter
    private let staleInterval: TimeInterval
    private let now: @Sendable () -> Date

    public init(
        database: AppDatabase,
        staleInterval: TimeInterval = RangeCache.defaultStaleInterval,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.db = database.writer
        self.staleInterval = staleInterval
        self.now = now
    }

    public func markLoaded(key: EventRangeQueryKey, fetchedAt: Date? = nil) throws {
        let stamp = (fetchedAt ?? now()).timeIntervalSince1970
        let record = LoadedRangeRecord(
            source: key.loadedRangeSource,
            start: key.start,
            end: key.end,
            fetchedAt: stamp
        )
        try db.write { db in
            try record.save(db, onConflict: .replace)
        }
    }

    public func coverage(for key: EventRangeQueryKey) throws -> RangeCoverage {
        try db.read { db in
            guard let row = try LoadedRangeRecord.fetchOne(
                db,
                key: [key.loadedRangeSource, key.start, key.end]
            ) else {
                return .missing
            }
            let fetchedAt = Date(timeIntervalSince1970: row.fetchedAt)
            let age = now().timeIntervalSince(fetchedAt)
            if age > staleInterval {
                return .stale(fetchedAt: fetchedAt)
            }
            return .fresh(fetchedAt: fetchedAt)
        }
    }

    /// Returns true when `stored` fully covers `request` (inclusive bounds).
    public static func intervalCovers(
        storedStart: String,
        storedEnd: String,
        requestStart: String,
        requestEnd: String
    ) -> Bool {
        storedStart <= requestStart && storedEnd >= requestEnd
    }

    public func clear(sourcePrefix: String? = nil) throws {
        try db.write { db in
            if let sourcePrefix {
                try db.execute(
                    sql: "DELETE FROM loaded_range WHERE source LIKE ?",
                    arguments: ["\(sourcePrefix)%"]
                )
            } else {
                try LoadedRangeRecord.deleteAll(db)
            }
        }
    }
}
