import XCTest
@testable import CompassKit

final class ShortcutMenuFilterTests: XCTestCase {
    private var registry: ShortcutRegistry!

    override func setUpWithError() throws {
        try super.setUpWithError()
        registry = try ShortcutRegistry()
    }

    func testLifeOnlyShortcutsResolveThroughWhenContext() throws {
        let lifePrev = try XCTUnwrap(registry.entries.first { $0.id == .navLifePrev })
        let calendarNext = try XCTUnwrap(registry.entries.first { $0.id == .navNext })

        XCTAssertTrue(
            ShortcutMenuFilter.isVisible(
                entry: lifePrev,
                options: ShortcutMenuFilter.Options(view: .life)))
        XCTAssertFalse(
            ShortcutMenuFilter.isVisible(
                entry: lifePrev,
                options: ShortcutMenuFilter.Options(view: .week)))
        XCTAssertFalse(
            ShortcutMenuFilter.isVisible(
                entry: calendarNext,
                options: ShortcutMenuFilter.Options(view: .life)))
        XCTAssertTrue(
            ShortcutMenuFilter.isVisible(
                entry: calendarNext,
                options: ShortcutMenuFilter.Options(view: .week)))
    }
}
