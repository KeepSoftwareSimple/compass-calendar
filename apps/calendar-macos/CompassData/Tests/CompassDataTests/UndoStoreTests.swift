import CompassData
import CompassKit
import XCTest

@MainActor
final class UndoStoreTests: XCTestCase {
    func testUndoRefusesSeriesEdit() throws {
        let store = UndoStore()
        let before = try StoreSampleEvents.seriesEvent(id: "series-1")
        let after = try StoreSampleEvents.timedEvent(id: "series-1", title: "Changed")

        store.record(.edit(id: before.id, before: before, after: after))
        XCTAssertTrue(store.past.isEmpty)
    }

    func testUndoRecordsSingleEdit() throws {
        let store = UndoStore()
        let before = try StoreSampleEvents.timedEvent(id: "evt-1", title: "Before")
        let after = try StoreSampleEvents.timedEvent(id: "evt-1", title: "After")

        store.record(.edit(id: before.id, before: before, after: after))
        XCTAssertEqual(store.past.count, 1)
    }
}
