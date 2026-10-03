import CompassData
import CompassKit
import XCTest

@MainActor
final class SettingsStoreTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "SettingsStoreTests")!
        defaults.removePersistentDomain(forName: "SettingsStoreTests")
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: "SettingsStoreTests")
        super.tearDown()
    }

    func testPersistsPinnedAndTimeTravelZonesThroughViewStore() {
        let viewStore = ViewStore()
        let store = SettingsStore(viewStore: viewStore, storage: defaults)
        XCTAssertTrue(store.setPinnedTimeZone("America/Chicago"))
        XCTAssertTrue(store.setTimeTravelTimeZone("America/Los_Angeles"))
        XCTAssertEqual(viewStore.pinnedTimeZone, "America/Chicago")
        XCTAssertEqual(viewStore.timeTravelTimeZone, "America/Los_Angeles")
        XCTAssertEqual(CompassDevicePreferences.readPinnedTimeZone(from: defaults), "America/Chicago")
        XCTAssertEqual(
            CompassDevicePreferences.readTimeTravelTimeZone(from: defaults),
            "America/Los_Angeles")
    }

    func testQuickAddHotKeyPersistsToUserDefaults() {
        let viewStore = ViewStore()
        let store = SettingsStore(viewStore: viewStore, storage: defaults)
        XCTAssertTrue(store.setQuickAddHotKey("Command+Control+K"))
        XCTAssertEqual(store.quickAddHotKeyDisplay, "Command+Control+K")
        XCTAssertEqual(defaults.string(forKey: QuickAddHotKeyStorage.userDefaultsKey), "Command+Control+K")
    }
}
