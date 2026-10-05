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
        let store = SettingsStore(storage: defaults)
        XCTAssertTrue(store.setDefaultCalendarId("cal-primary"))
        XCTAssertEqual(store.defaultCalendarId, "cal-primary")
        XCTAssertEqual(CompassDevicePreferences.readDefaultCalendarId(from: defaults), "cal-primary")

        let reloaded = SettingsStore(storage: defaults)
        XCTAssertEqual(reloaded.defaultCalendarId, "cal-primary")
    }

    func testOpenAndCloseResetsPageToAccounts() {
        let store = SettingsStore(storage: defaults)
        store.open(page: .billing)
        XCTAssertTrue(store.isPresented)
        XCTAssertEqual(store.page, .billing)
        store.close()
        XCTAssertFalse(store.isPresented)
        XCTAssertEqual(store.page, .accounts)
    }
}
