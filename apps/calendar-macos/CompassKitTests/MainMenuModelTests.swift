import CompassKit
import XCTest

final class MainMenuModelTests: XCTestCase {
    func testShortcutNamesMatchWebRegistryIds() {
        XCTAssertEqual(
            Set(MainMenuShortcutName.allCases.map(\.rawValue)),
            Set([
                "create-timed",
                "nav-today",
                "nav-day-view",
                "nav-week-view",
                "other-palette",
                "other-settings",
                "other-shortcuts",
            ]))
    }

    func testKeyEquivalentsMatchWebKeymap() {
        XCTAssertEqual(MainMenuModel.keyEquivalent(for: .navToday), MacKeyEquivalent(key: "t"))
        XCTAssertEqual(MainMenuModel.keyEquivalent(for: .navDayView), MacKeyEquivalent(key: "d"))
        XCTAssertEqual(MainMenuModel.keyEquivalent(for: .navWeekView), MacKeyEquivalent(key: "w"))
        XCTAssertEqual(
            MainMenuModel.keyEquivalent(for: .otherPalette),
            MacKeyEquivalent(key: "k", command: true))
        XCTAssertEqual(
            MainMenuModel.keyEquivalent(for: .createTimed),
            MacKeyEquivalent(key: "c"))
        XCTAssertEqual(
            MainMenuModel.keyEquivalent(for: .otherSettings),
            MacKeyEquivalent(key: ",", command: true))
        XCTAssertEqual(
            MainMenuModel.keyEquivalent(for: .otherShortcuts),
            MacKeyEquivalent(key: "/", command: true, shift: true))
    }

    func testViewSectionDispatchesTodayShortcut() {
        let view = MainMenuModel.sections(showDebugMenu: false).first { $0.title == "View" }
        let today = view?.rows.first { $0.title == "Today" }
        XCTAssertEqual(today?.action, .dispatchShortcut(.navToday))
        XCTAssertEqual(today?.keyEquivalent, MacKeyEquivalent(key: "t"))
    }

    func testCompassMenuHasUpdateRows() {
        let compass = MainMenuModel.sections(showDebugMenu: false).first { $0.title == "Compass" }
        XCTAssertEqual(
            compass?.rows.first { $0.title == "Check for Updates…" }?.action, .checkForUpdates)
        XCTAssertEqual(
            compass?.rows.first { $0.title == "Restart to update" }?.action, .restartToUpdate)
    }

    func testDebugSectionIsOptional() {
        XCTAssertFalse(
            MainMenuModel.sections(showDebugMenu: false).contains { $0.title == "Debug" })
        XCTAssertTrue(
            MainMenuModel.sections(showDebugMenu: true).contains { $0.title == "Debug" })
    }

    func testHelpSectionIncludesFeedback() {
        let help = MainMenuModel.sections(showDebugMenu: false).first { $0.title == "Help" }
        XCTAssertEqual(
            help?.rows.first { $0.title == "Share Feedback…" }?.action,
            .shareFeedback)
    }
}
