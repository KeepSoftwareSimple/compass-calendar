import CompassData
import CompassKit
import XCTest

final class CompassDevicePreferencesTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "CompassDevicePreferencesTests")!
        defaults.removePersistentDomain(forName: "CompassDevicePreferencesTests")
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: "CompassDevicePreferencesTests")
        super.tearDown()
    }

    func testDefaultCalendarIdRoundTrip() {
        XCTAssertTrue(CompassDevicePreferences.writeDefaultCalendarId("cal-1", to: defaults))
        XCTAssertEqual(defaults.string(forKey: CompassStorageKeys.defaultCalendarId), "cal-1")
        XCTAssertEqual(CompassDevicePreferences.readDefaultCalendarId(from: defaults), "cal-1")
        XCTAssertTrue(CompassDevicePreferences.writeDefaultCalendarId(nil, to: defaults))
        XCTAssertNil(CompassDevicePreferences.readDefaultCalendarId(from: defaults))
    }
}
