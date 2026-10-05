import CompassData
import CompassKit
import XCTest

final class DemoDataSeederTests: XCTestCase {
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
}
