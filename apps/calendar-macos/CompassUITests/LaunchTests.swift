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

        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))

        // WebKit exposes the page as its own accessibility WebView; the shell
        // mirrors bridge.version on a native host with this identifier.
        let bridgeHost = app.descendants(matching: .any)["CompassWebView"]
        XCTAssertTrue(bridgeHost.waitForExistence(timeout: 10))

        let version = bridgeHost.value as? String
        XCTAssertEqual(version, "0.1.0")
    }
}
