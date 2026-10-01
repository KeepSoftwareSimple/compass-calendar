import CompassKit
import XCTest

final class AppHostPreferenceTests: XCTestCase {
    func testProductionIsDefaultWhenUnset() {
        let defaults = UserDefaults(suiteName: "AppHostPreferenceTests")!
        defaults.removePersistentDomain(forName: "AppHostPreferenceTests")
        XCTAssertEqual(AppHostPreference.load(from: defaults), .production)
    }

    func testResolvePrefersPersistedHost() {
        let defaults = UserDefaults(suiteName: "AppHostPreferenceTests.resolve")!
        defaults.removePersistentDomain(forName: "AppHostPreferenceTests.resolve")
        AppHostPreference.staging.save(to: defaults)
        let url = AppOrigin.resolve(
            override: nil,
            infoValue: "https://compasscalendar.com",
            defaults: defaults)
        XCTAssertEqual(url, AppHostPreference.stagingURL)
    }
}
