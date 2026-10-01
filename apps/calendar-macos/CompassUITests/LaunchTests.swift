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

    @MainActor
    func testTodayMenuDispatchesNavTodayShortcut() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 5))

        let versionReady = NSPredicate(format: "value == %@", "0.1.0")
        wait(
            for: [expectation(for: versionReady, evaluatedWith: window, handler: nil)],
            timeout: 30)

        app.menuBars.menuBarItems["View"].click()
        app.menuBars.menuItems["Today"].click()

        let shortcutReady = NSPredicate(format: "value == %@", "nav-today")
        let shortcutExpectation = expectation(
            for: shortcutReady,
            evaluatedWith: window,
            handler: nil)
        wait(for: [shortcutExpectation], timeout: 30)
    }

    @MainActor
    func testLaunchDeepLinkNavigatesToDayView() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_LAUNCH_DEEP_LINK", "compass://day/2026-10-15"]
        app.launch()

        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 5))

        let versionReady = NSPredicate(format: "value == %@", "0.1.0")
        wait(
            for: [expectation(for: versionReady, evaluatedWith: window, handler: nil)],
            timeout: 30)

        let pathReady = NSPredicate(format: "value == %@", "/day/2026-10-15")
        let pathExpectation = expectation(
            for: pathReady,
            evaluatedWith: window,
            handler: nil)
        wait(for: [pathExpectation], timeout: 45)
    }
}
