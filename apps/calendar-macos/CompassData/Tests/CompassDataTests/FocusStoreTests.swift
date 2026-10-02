import CompassData
import CompassKit
import XCTest

@MainActor
final class FocusStoreTests: XCTestCase {
    func testFocusOrderMatchesRegistryOrder() {
        let store = FocusStore(view: .week)
        store.register(eventId: EventId(rawValue: "b"), eventType: .timed)
        store.register(eventId: EventId(rawValue: "a"), eventType: .timed)
        store.register(eventId: EventId(rawValue: "c"), eventType: .allDay)

        let order = store.navigableEventOrder().map(\.eventId.rawValue)
        XCTAssertEqual(order, ["b", "a", "c"])
    }
}
