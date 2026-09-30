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

        // WebKit exposes the page as its own accessibility WebView. The shell
        // mirrors bridge.version on the main window for XCUITest.
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 5))

        let versionReady = NSPredicate(format: "value == %@", "0.1.0")
        let bridgeVersionExpectation = expectation(
            for: versionReady,
            evaluatedWith: window,
            handler: nil)
        wait(for: [bridgeVersionExpectation], timeout: 30)
    }
}
