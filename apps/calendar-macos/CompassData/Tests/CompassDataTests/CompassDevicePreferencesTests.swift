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

    func testThemeRoundTripUsesCompassThemeKey() {
        XCTAssertTrue(CompassDevicePreferences.writeTheme(.darkAbyss, to: defaults))
        XCTAssertEqual(defaults.string(forKey: CompassStorageKeys.theme), "dark-abyss")
        XCTAssertEqual(CompassDevicePreferences.readTheme(from: defaults), .darkAbyss)
    }

    func testDefaultCalendarIdRoundTrip() {
        XCTAssertTrue(CompassDevicePreferences.writeDefaultCalendarId("cal-1", to: defaults))
        XCTAssertEqual(CompassDevicePreferences.readDefaultCalendarId(from: defaults), "cal-1")
        XCTAssertTrue(CompassDevicePreferences.writeDefaultCalendarId(nil, to: defaults))
        XCTAssertNil(CompassDevicePreferences.readDefaultCalendarId(from: defaults))
    }

    func testPinnedTimeZoneRejectsInvalidZone() {
        XCTAssertFalse(CompassDevicePreferences.writePinnedTimeZone("Not/AZone", to: defaults))
        XCTAssertNil(CompassDevicePreferences.readPinnedTimeZone(from: defaults))
        XCTAssertTrue(CompassDevicePreferences.writePinnedTimeZone("America/Denver", to: defaults))
        XCTAssertEqual(CompassDevicePreferences.readPinnedTimeZone(from: defaults), "America/Denver")
    }

    func testTimeTravelTimeZoneRoundTrip() {
        XCTAssertTrue(CompassDevicePreferences.writeTimeTravelTimeZone("Europe/London", to: defaults))
        XCTAssertEqual(CompassDevicePreferences.readTimeTravelTimeZone(from: defaults), "Europe/London")
        XCTAssertTrue(CompassDevicePreferences.writeTimeTravelTimeZone(nil, to: defaults))
        XCTAssertNil(CompassDevicePreferences.readTimeTravelTimeZone(from: defaults))
    }
}
