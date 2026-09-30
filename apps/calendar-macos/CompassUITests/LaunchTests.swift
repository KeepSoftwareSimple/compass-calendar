import XCTest

final class LaunchTests: XCTestCase {
    @MainActor
    func testLaunchShowsTheMainWindow() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.windows["Compass"].waitForExistence(timeout: 15))
    }

    @MainActor
    func testBridgeVersionIsInjectedIntoTheLoadedPage() {
        let app = XCUIApplication()
        app.launch()

        let webView = app.webViews["CompassWebView"]
        XCTAssertTrue(webView.waitForExistence(timeout: 30))

        let version = webView.value as? String
        XCTAssertEqual(version, "0.1.0")
    }
}
