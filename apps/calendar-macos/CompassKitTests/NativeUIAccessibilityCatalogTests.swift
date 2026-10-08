import CompassKit
import XCTest

final class NativeUIAccessibilityCatalogTests: XCTestCase {
    func testCatalogListsUniqueSortedIdentifiers() {
        let catalog = NativeUIAccessibilityCatalog.allUniqueSorted
        XCTAssertEqual(catalog, catalog.sorted())
        XCTAssertEqual(catalog.count, Set(catalog).count)
        XCTAssertTrue(catalog.contains("compass-native-header"))
        XCTAssertTrue(catalog.contains("block-party-overlay"))
    }

    func testDemoWeekGridBaselineIsStable() {
        XCTAssertEqual(
            NativeUIAccessibilityCatalog.demoWeekGridBaseline,
            [
                "Compass",
                "compass-native-demo-events-banner",
                "compass-native-header",
                "compass-native-sidebar",
                "compass-native-content",
                "compass-grid-timed",
            ])
    }
}
