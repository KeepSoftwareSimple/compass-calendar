import XCTest
@testable import CompassKit

final class ShortcutLegendSectionsTests: XCTestCase {
    private var registry: ShortcutRegistry!

    override func setUpWithError() throws {
        try super.setUpWithError()
        registry = try ShortcutRegistry()
    }

    func testWeekLegendRowsInFiveSections() {
        let options = ShortcutMenuFilter.Options(
            view: .week,
            isViewingCurrentPeriod: true,
            isFormOpen: false,
            isTrialing: false)
        let sections = ShortcutLegendSections.menuSections(registry: registry, options: options)
        XCTAssertEqual(sections.count, 5)
        let rowCount = sections.reduce(0) { $0 + $1.rows.count }
        let expected = registry.entries.filter {
            ShortcutMenuFilter.isVisible(entry: $0, options: options)
        }.count
        XCTAssertEqual(rowCount, expected)
        XCTAssertEqual(Set(sections.map(\.id)), Set(["navigate", "create", "focus", "edit", "other"]))
    }

    func testPublicCatalogLoadsFromRegistry() {
        let sections = ShortcutLegendSections.publicCatalogSections(registry: registry)
        XCTAssertFalse(sections.isEmpty)
        XCTAssertTrue(sections.contains { $0.id == "navigate" })
    }
}
