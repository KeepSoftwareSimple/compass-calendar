import CompassKit
import Foundation

/// Seeds `demo-seed.json` into `local_event` on first launch (idempotent).
public enum DemoDataSeeder {
    public static let migrationKey = "compass.migration.demo-data-seed-v2"

    public static func seedIfNeeded(
        localEvents: LocalEventRepository,
        metadata: UserMetadataRepository,
        fixture: DemoSeedFixture? = nil
    ) throws {
        let existing = try localEvents.fetchAll()
        if !existing.isEmpty {
            return
        }
        if try metadata.fetch(key: migrationKey) != nil {
            return
        }

        let seed = try fixture ?? DemoSeedFixture.load()
        let records = seed.events.map { row in
            LocalEventRecord(id: EventId(rawValue: row.id), event: row.event, isDemo: row.isDemo)
        }
        try localEvents.putMany(records)
        try metadata.upsert(key: migrationKey, value: MigrationMarker(appliedAt: ISO8601DateFormatter().string(from: Date())))
    }

    private struct MigrationMarker: Codable {
        var appliedAt: String
    }
}
