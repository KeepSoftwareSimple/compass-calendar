import CompassData
import CompassKit
import XCTest

@MainActor
final class HiddenEventsStoreTests: XCTestCase {
    func testSerializedWritesKeepLatestHideAfterSlowUnhide() async throws {
        let database = try AppDatabase.inMemory()
        let repository = HiddenEventRepository(database: database)
        let remote = MockUserAPI()
        let unhideGate = AsyncTestGate()
        remote.hiddenIds = []
        remote.setHiddenHandler = { input in
            if input.hidden {
                if !remote.hiddenIds.contains(input.eventId.rawValue) {
                    remote.hiddenIds.append(input.eventId.rawValue)
                }
                return remote.hiddenIds
            }
            await unhideGate.wait()
            remote.hiddenIds.removeAll { $0 == input.eventId.rawValue }
            return remote.hiddenIds
        }
        let store = HiddenEventsStore(
            repository: repository,
            remoteClient: remote,
            source: .remote
        )
        try await store.load()
        let eventId = EventId(rawValue: "evt-race")

        try await store.setEventHidden(eventId: eventId, hidden: true)
        async let unhide: Void = store.setEventHidden(eventId: eventId, hidden: false)
        async let rehide: Void = store.setEventHidden(eventId: eventId, hidden: true)
        await unhideGate.resume()
        try await unhide
        try await rehide

        XCTAssertTrue(store.isHidden(eventId))
    }

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
