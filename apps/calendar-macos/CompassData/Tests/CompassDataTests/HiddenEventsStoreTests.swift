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

        let unhideTask = Task { try await store.setEventHidden(eventId: eventId, hidden: false) }
        let rehideTask = Task { try await store.setEventHidden(eventId: eventId, hidden: true) }
        recordIfApplied(try await unhideTask.value, hidden: false)
        recordIfApplied(try await rehideTask.value, hidden: true)

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

        let unhideTask = Task { try await store.setEventHidden(eventId: eventId, hidden: false) }
        let rehideTask = Task { try await store.setEventHidden(eventId: eventId, hidden: true) }
        let first = try await unhideTask.value
        let second = try await rehideTask.value

        XCTAssertEqual(first, .superseded)
        XCTAssertEqual(second, .applied)
        XCTAssertTrue(store.isHidden(eventId))
    }

    func testLoadMergesPendingIntentDuringInFlightWrite() async throws {
        let database = try AppDatabase.inMemory()
        let repository = HiddenEventRepository(database: database)
        let remote = MockUserAPI()
        let putGate = AsyncTestGate()
        let hideReached = AsyncTestSignal()
        remote.hiddenIds = []
        remote.setHiddenHandler = { input in
            if input.hidden {
                await hideReached.signal()
                try await putGate.waitForTest()
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

        let hideTask = Task { try await store.setEventHidden(eventId: eventId, hidden: true) }
        try await hideReached.waitForTest()
        XCTAssertTrue(store.isHidden(eventId))

        remote.hiddenIds = []
        try await store.load()
        XCTAssertTrue(store.isHidden(eventId))

        await putGate.resume()
        let hideResult = try await hideTask.value
        XCTAssertEqual(hideResult, .applied)
        XCTAssertTrue(store.isHidden(eventId))
    }

    func testSerializedWritesKeepLatestHideAfterSlowUnhide() async throws {
        let database = try AppDatabase.inMemory()
        let repository = HiddenEventRepository(database: database)
        let remote = MockUserAPI()
        let unhideGate = AsyncTestGate()
        let unhideReached = AsyncTestSignal()
        remote.hiddenIds = []
        remote.setHiddenHandler = { input in
            if input.hidden {
                if !remote.hiddenIds.contains(input.eventId.rawValue) {
                    remote.hiddenIds.append(input.eventId.rawValue)
                }
                return remote.hiddenIds
            }
            await unhideReached.signal()
            try await unhideGate.waitForTest()
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
        let unhideTask = Task { try await store.setEventHidden(eventId: eventId, hidden: false) }
        try await unhideReached.waitForTest()
        let rehideTask = Task { try await store.setEventHidden(eventId: eventId, hidden: true) }
        await unhideGate.resume()
        let unhideResult = try await unhideTask.value
        let rehideResult = try await rehideTask.value

        XCTAssertEqual(rehideResult, .applied)
        XCTAssertTrue(store.isHidden(eventId))
        _ = unhideResult
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
