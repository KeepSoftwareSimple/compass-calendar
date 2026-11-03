import CompassData
import CompassKit
import XCTest

final class DemoDataSeederTests: XCTestCase {
    func testRepairsUntouchedLegacySamplesButPreservesEditedAndRealEvents() throws {
        let database = try AppDatabase.inMemory()
        let events = LocalEventRepository(database: database)
        let metadata = UserMetadataRepository(database: database)
        let fixture = try DemoSeedFixture.load()
        try DemoDataSeeder.seedIfNeeded(localEvents: events, metadata: metadata, fixture: fixture)
        let sample = try XCTUnwrap(events.fetchAll().first { $0.id.rawValue == "demo-morning-standup" })
        let edited = Event(calendarId: sample.event.calendarId,
            content: .details(.init(description: "My notes", kind: "details", title: "My edited sample")),
            createdAt: sample.event.createdAt, id: sample.id, recurrence: sample.event.recurrence,
            schedule: sample.event.schedule, updatedAt: sample.event.updatedAt)
        try events.put(.init(id: sample.id, event: edited, isDemo: true))
        let recurring = try XCTUnwrap(events.fetchAll().first { $0.id.rawValue == "demo-weekly-sync" })
        let exception = LocalEventRecord(id: recurring.id, event: recurring.event, isDemo: true,
            exdates: ["2026-06-10T21:00:00.000Z"])
        try events.put(exception)
        let real = try StoreSampleEvents.timedEvent(id: "real-event")
        try events.put(.init(id: real.id, event: real, isDemo: false))
        let beforeCount = try events.fetchAll().count
        let originalOccurrences = try events.fetchAll().filter { $0.id.rawValue.hasPrefix("demo-weekly-sync|") }
        let now = Date(timeIntervalSince1970: 1_792_076_400)
        let zone = TimeZone(identifier: "America/Los_Angeles")!
        try DemoDataSeeder.seedIfNeeded(localEvents: events, metadata: metadata, now: now, timeZone: zone)
        let repaired = try events.fetchAll()
        XCTAssertEqual(repaired.first { $0.id == sample.id }?.event, edited)
        XCTAssertEqual(repaired.first { $0.id == real.id }?.event, real)
        XCTAssertEqual(repaired.first { $0.id == recurring.id }?.exdates, exception.exdates)
        XCTAssertEqual(repaired.first { $0.id == recurring.id }?.event, recurring.event)
        XCTAssertEqual(Set(repaired.filter { $0.id.rawValue.hasPrefix("demo-weekly-sync|") }.map(\.id)),
            Set(originalOccurrences.map(\.id)))
        let expected = fixture.rebased(to: now, timeZone: zone)
        let team = try XCTUnwrap(expected.events.first { $0.id == "demo-team-sync" })
        XCTAssertEqual(repaired.first { $0.id.rawValue == team.id }?.event, team.event)
        XCTAssertEqual(repaired.count, beforeCount)
        try DemoDataSeeder.seedIfNeeded(localEvents: events, metadata: metadata,
            now: now.addingTimeInterval(86400), timeZone: zone)
        XCTAssertEqual(Set(try events.fetchAll().map(\.id)), Set(repaired.map(\.id)))
        XCTAssertEqual(try events.fetchAll().first { $0.id.rawValue == team.id }?.event, team.event)
    }

    func testSeedIsIdempotent() throws {
        let database = try AppDatabase.inMemory()
        let localEvents = LocalEventRepository(database: database)
        let metadata = UserMetadataRepository(database: database)
        let fixture = try DemoSeedFixture.load()

        try DemoDataSeeder.seedIfNeeded(
            localEvents: localEvents,
            metadata: metadata,
            fixture: fixture)
        let firstCount = try localEvents.fetchAll().count
        XCTAssertGreaterThan(firstCount, 0)

        try DemoDataSeeder.seedIfNeeded(
            localEvents: localEvents,
            metadata: metadata,
            fixture: fixture)
        let secondCount = try localEvents.fetchAll().count
        XCTAssertEqual(firstCount, secondCount)
    }

    func testSeedWithoutPresentationLandsOnTodayInTheSystemZone() throws {
        let database = try AppDatabase.inMemory()
        let localEvents = LocalEventRepository(database: database)
        let metadata = UserMetadataRepository(database: database)
        let zone = TimeZone(identifier: "America/Los_Angeles")!
        // 2026-10-15 08:00 in Los Angeles.
        let now = Date(timeIntervalSince1970: 1_792_076_400)

        try DemoDataSeeder.seedIfNeeded(
            localEvents: localEvents, metadata: metadata, now: now, timeZone: zone)

        let events = try localEvents.fetchAll().map(\.event)
        let standup = try XCTUnwrap(events.first { $0.id.rawValue == "demo-morning-standup" })
        guard case .timed(let schedule) = standup.schedule else { return XCTFail("standup is timed") }
        XCTAssertEqual(schedule.start.rawValue, "2026-10-15T09:00:00-07:00")
        XCTAssertEqual(schedule.end.rawValue, "2026-10-15T09:30:00-07:00")
        XCTAssertEqual(schedule.timeZone.rawValue, "America/Los_Angeles")

        let allDay = events.compactMap { event -> EventSchedule_AllDayPayload? in
            if case .allDay(let payload) = event.schedule { return payload }
            return nil
        }
        XCTAssertEqual(allDay.map(\.start), ["2026-10-15"])
        XCTAssertEqual(allDay.map(\.end), ["2026-10-16"])

        let occurrenceIds = events.map(\.id.rawValue).filter { $0.hasPrefix("demo-weekly-sync|") }.sorted()
        XCTAssertEqual(occurrenceIds, [
            "demo-weekly-sync|2026-10-15T21:00:00.000Z",
            "demo-weekly-sync|2026-10-17T21:00:00.000Z",
            "demo-weekly-sync|2026-10-22T21:00:00.000Z",
        ])
    }
}
