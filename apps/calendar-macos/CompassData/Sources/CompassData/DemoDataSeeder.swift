import CompassKit
import Foundation

/// Seeds `demo-seed.json` into `local_event` on first launch (idempotent).
/// Without a `-COMPASS_FIXTURE` presentation the rows move to today in the
/// system zone, like web's demo seed.
public enum DemoDataSeeder {
    public static let migrationKey = "compass.migration.demo-data-seed-v2"
    private static let legacyRepairKey = "compass.migration.demo-data-legacy-dates-v1"

    public static func seedIfNeeded(
        localEvents: LocalEventRepository,
        metadata: UserMetadataRepository,
        fixture: DemoSeedFixture? = nil,
        now: Date = Date(),
        timeZone: TimeZone = .current
    ) throws {
        let existing = try localEvents.fetchAll()
        if !existing.isEmpty {
            if fixture == nil {
                try repairLegacyDates(localEvents: localEvents, metadata: metadata,
                    existing: existing, now: now, timeZone: timeZone)
            }
            return
        }
        if try metadata.fetch(key: migrationKey) != nil {
            return
        }

        let seed = try fixture ?? DemoSeedFixture.load().rebased(to: now, timeZone: timeZone)
        var records = seed.events.map { row in
            LocalEventRecord(id: EventId(rawValue: row.id), event: row.event, isDemo: row.isDemo)
        }
        if UITestLaunchPolicy.appendDemoOccurrenceForUITest {
            records.append(try UITestDemoOccurrence.localRecord(calendarId: seed.calendarId))
        }
        try localEvents.putMany(records)
        try metadata.upsert(key: migrationKey, value: MigrationMarker(appliedAt: ISO8601DateFormatter().string(from: Date())))
    }

    /// Early desktop builds persisted the fixture's June dates. Move only
    /// untouched fixture rows to today; never replace a user's edited sample.
    private static func repairLegacyDates(
        localEvents: LocalEventRepository, metadata: UserMetadataRepository,
        existing: [LocalEventRecord], now: Date, timeZone: TimeZone
    ) throws {
        guard try metadata.fetch(key: legacyRepairKey) == nil else { return }
        let original = try DemoSeedFixture.load()
        let rebased = original.rebased(to: now, timeZone: timeZone)
        let stored = Dictionary(uniqueKeysWithValues: existing.map { ($0.id.rawValue, $0) })
        func seriesId(_ row: DemoSeedFixture.Row) -> String? {
            switch row.event.recurrence {
            case .series: row.id
            case .occurrence(let occurrence): occurrence.seriesId.rawValue
            default: nil
            }
        }
        // A changed or deleted occurrence makes the whole series user-owned.
        let editedSeries = Set(original.events.compactMap { row -> String? in
            guard let id = seriesId(row) else { return nil }
            guard let record = stored[row.id], record.isDemo, record.event == row.event,
                record.exdates?.isEmpty != false else { return id }
            return nil
        })
        var upserts: [LocalEventRecord] = []
        var removing: [EventId] = []
        for (before, after) in zip(original.events, rebased.events) {
            if let series = seriesId(before), editedSeries.contains(series) { continue }
            guard let record = stored[before.id], record.isDemo, before.isDemo,
                record.event == before.event, record.exdates?.isEmpty != false else { continue }
            guard before.id == after.id || stored[after.id] == nil else { continue }
            upserts.append(.init(id: .init(rawValue: after.id), event: after.event, isDemo: true))
            if before.id != after.id { removing.append(record.id) }
        }
        try localEvents.apply(upserts: upserts, removing: removing)
        try metadata.upsert(key: legacyRepairKey, value: true)
    }

    private struct MigrationMarker: Codable {
        var appliedAt: String
    }
}
