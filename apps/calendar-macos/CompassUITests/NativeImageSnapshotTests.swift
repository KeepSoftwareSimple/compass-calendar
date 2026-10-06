import XCTest

final class NativeImageSnapshotTests: XCTestCase {
    @MainActor
    func testDemoWeekGridSnapshot() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        NativeImageSnapshotSupport.captureWindow(window, named: "demo-week-grid")
    }

    @MainActor
    func testLifeViewSnapshot() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey("l", modifierFlags: [])
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-life-grid"].waitForExistence(timeout: 8))
        NativeImageSnapshotSupport.captureWindow(window, named: "life-view")
    }
}
