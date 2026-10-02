import CompassData
import CompassKit
import XCTest

@MainActor
final class HiddenEventsStoreTests: XCTestCase {
    func testHiddenEventRollbackOnFailure() async throws {
        let database = try AppDatabase.inMemory()
        let repository = HiddenEventRepository(database: database)
        let remote = MockUserAPI()
        remote.hiddenIds = []
        let store = HiddenEventsStore(
            repository: repository,
            remoteClient: remote,
            source: .remote
        )
        try await store.load()
        let eventId = EventId(rawValue: "evt-hide")

        remote.setHiddenError = NSError(domain: "test", code: 1)
        do {
            try await store.setEventHidden(eventId: eventId, hidden: true)
            XCTFail("expected throw")
        } catch {
            XCTAssertFalse(store.isHidden(eventId))
        }
    }
}
