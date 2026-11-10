import CompassData
import CompassKit
import XCTest

@MainActor
final class HiddenEventsStoreTests: XCTestCase {
    func testSupersededWriteSkipsUndoStyleSideEffects() async throws {
        let database = try AppDatabase.inMemory()
        let repository = HiddenEventRepository(database: database)
        let remote = MockUserAPI()
        remote.hiddenIds = ["evt-race"]
        let store = HiddenEventsStore(
            repository: repository,
            remoteClient: remote,
            source: .remote
        )
        try await store.load()
        let eventId = EventId(rawValue: "evt-race")
        var undoCount = 0
        func recordIfApplied(_ result: HiddenEventWriteResult, hidden: Bool) {
            guard result == .applied else { return }
            undoCount += 1
            _ = hidden
        }

        async let unhide = store.setEventHidden(eventId: eventId, hidden: false)
        async let rehide = store.setEventHidden(eventId: eventId, hidden: true)
        recordIfApplied(try await unhide, hidden: false)
        recordIfApplied(try await rehide, hidden: true)

        XCTAssertEqual(undoCount, 1)
    }

    func testSupersededWriteReturnsWithoutApplying() async throws {
        let database = try AppDatabase.inMemory()
        let repository = HiddenEventRepository(database: database)
        let remote = MockUserAPI()
        remote.hiddenIds = ["evt-race"]
        let store = HiddenEventsStore(
            repository: repository,
            remoteClient: remote,
            source: .remote
        )
        try await store.load()
        let eventId = EventId(rawValue: "evt-race")

        async let unhide = store.setEventHidden(eventId: eventId, hidden: false)
        async let rehide = store.setEventHidden(eventId: eventId, hidden: true)
        let first = try await unhide
        let second = try await rehide

        XCTAssertEqual(first, .superseded)
        XCTAssertEqual(second, .applied)
        XCTAssertTrue(store.isHidden(eventId))
    }

    func testLoadMergesPendingIntentDuringInFlightWrite() async throws {
        let database = try AppDatabase.inMemory()
        let repository = HiddenEventRepository(database: database)
        let remote = MockUserAPI()
        let putGate = AsyncTestGate()
        remote.hiddenIds = []
        remote.setHiddenHandler = { input in
            if input.hidden {
                await putGate.wait()
                remote.hiddenIds = [input.eventId.rawValue]
                return remote.hiddenIds
            }
            remote.hiddenIds.removeAll { $0 == input.eventId.rawValue }
            return remote.hiddenIds
        }
        let store = HiddenEventsStore(
            repository: repository,
            remoteClient: remote,
            source: .remote
        )
        try await store.load()
        let eventId = EventId(rawValue: "evt-refetch")

        async let hide = store.setEventHidden(eventId: eventId, hidden: true)
        XCTAssertTrue(store.isHidden(eventId))

        remote.hiddenIds = []
        try await store.load()
        XCTAssertTrue(store.isHidden(eventId))

        await putGate.resume()
        _ = try await hide
        XCTAssertTrue(store.isHidden(eventId))
    }

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
        async let unhide = store.setEventHidden(eventId: eventId, hidden: false)
        async let rehide = store.setEventHidden(eventId: eventId, hidden: true)
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
