import XCTest

final class NativeLaunchTests: XCTestCase {
    @MainActor
    func testNativeLaunchShowsHeaderAndSidebar() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES"]
        app.launch()

        XCTAssertTrue(app.windows["Compass"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.otherElements["compass-native-header"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.otherElements["compass-native-sidebar"].waitForExistence(timeout: 5))
    }
}
