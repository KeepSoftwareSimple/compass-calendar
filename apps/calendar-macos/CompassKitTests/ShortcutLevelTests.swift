import XCTest
@testable import CompassKit

final class ShortcutLevelTests: XCTestCase {
    private let levels = [
        ShortcutLevelDefinition(level: 1, name: "Newcomer", minUsed: 0),
        ShortcutLevelDefinition(level: 2, name: "Explorer", minUsed: 4),
        ShortcutLevelDefinition(level: 3, name: "Navigator", minUsed: 10),
    ]

    func testNewcomerWithNoUsage() {
        let snapshot = ShortcutLevelMath.compute(
            usedIds: [],
            registryIds: ["nav-next", "nav-prev", "create-event", "edit-open"],
            levels: levels)
        XCTAssertEqual(snapshot.level, 1)
        XCTAssertEqual(snapshot.name, "Newcomer")
        XCTAssertEqual(snapshot.used, 0)
        XCTAssertEqual(snapshot.remaining, 4)
        XCTAssertEqual(snapshot.nextName, "Explorer")
    }

    func testExplorerThreshold() {
        let used: Set<String> = ["nav-next", "nav-prev", "create-event", "edit-open"]
        let snapshot = ShortcutLevelMath.compute(
            usedIds: used,
            registryIds: Array(used) + ["focus-tab"],
            levels: levels)
        XCTAssertEqual(snapshot.level, 2)
        XCTAssertEqual(snapshot.used, 4)
    }

    func testUnknownIdsDoNotCount() {
        let snapshot = ShortcutLevelMath.compute(
            usedIds: ["removed-shortcut"],
            registryIds: ["nav-next"],
            levels: levels)
        XCTAssertEqual(snapshot.used, 0)
        XCTAssertEqual(snapshot.level, 1)
    }
}
