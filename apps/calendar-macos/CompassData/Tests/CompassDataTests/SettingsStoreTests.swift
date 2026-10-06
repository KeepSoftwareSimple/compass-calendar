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

    func testDefaultCalendarIdPersistsThroughStore() {
        let viewStore = ViewStore()
        let store = SettingsStore(viewStore: viewStore, storage: defaults)
        XCTAssertTrue(store.setDefaultCalendarId("cal-primary"))
        XCTAssertEqual(store.defaultCalendarId, "cal-primary")
        XCTAssertEqual(CompassDevicePreferences.readDefaultCalendarId(from: defaults), "cal-primary")
    }

    func testOpenAndCloseResetsPageToAccounts() {
        let viewStore = ViewStore()
        let store = SettingsStore(viewStore: viewStore, storage: defaults)
        store.open(page: .billing)
        store.openTimezoneDialog(.pin)
        store.close()
        XCTAssertFalse(store.isPresented)
        XCTAssertEqual(store.page, .accounts)
        XCTAssertNil(store.timezoneDialogPurpose)
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

    func testThemePersistsAndUsesBridge() {
        let viewStore = ViewStore()
        final class ThemeBridge: NativeSettingsBridge {
            var applied: CompassThemeName?
            func launchAtLoginEnabled() -> Bool { false }
            func setLaunchAtLogin(_ enabled: Bool) throws {}
            func applyQuickAddHotKey(_ displayString: String) {}
            func applyTheme(_ theme: CompassThemeName) { applied = theme }
        }
        let bridge = ThemeBridge()
        let store = SettingsStore(viewStore: viewStore, storage: defaults, bridge: bridge)
        XCTAssertTrue(store.setTheme(.darkAbyss))
        XCTAssertEqual(store.theme, .darkAbyss)
        XCTAssertEqual(bridge.applied, .darkAbyss)
        XCTAssertEqual(CompassDevicePreferences.readTheme(from: defaults), .darkAbyss)
    }
}
