import XCTest

final class NativeLaunchTests: XCTestCase {
    /// AppKit event cards often report 0×0 accessibility frames in CI; coordinate clicks still hit layout bounds.
    @MainActor
    private func clickGridEvent(_ element: XCUIElement) {
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
    }

    @MainActor
    func testNativeLaunchShowsHeaderAndSidebar() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-header"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-sidebar"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testFixtureLaunchShowsDemoWeekEvents() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES", "-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.buttons["Morning standup"].waitForExistence(timeout: 10),
            "Expected demo fixture event title on the native grid")
    }

    @MainActor
    func testArrowMovesFocusBetweenTwoFixtureEvents() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES", "-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        let standup = window.buttons["compass-grid-event-demo-morning-standup"]
        XCTAssertTrue(standup.waitForExistence(timeout: 10))
        clickGridEvent(standup)

        let focused = window.buttons["compass-grid-event-focused"]
        XCTAssertTrue(focused.waitForExistence(timeout: 10))
        XCTAssertEqual(focused.label, "Morning standup")

        window.typeKey(.downArrow, modifierFlags: [])
        let tryCompassFocused = window.buttons["compass-grid-event-focused"]
        XCTAssertTrue(tryCompassFocused.waitForExistence(timeout: 5))
        XCTAssertEqual(tryCompassFocused.label, "Try Compass")
    }

    @MainActor
    func testEventClickShowsPointerHintWithoutOpening() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES", "-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        let standup = window.buttons["compass-grid-event-demo-morning-standup"]
        XCTAssertTrue(standup.waitForExistence(timeout: 10))
        clickGridEvent(standup)

        let hint = window.descendants(matching: .any)["compass-pointer-hint"]
        XCTAssertTrue(hint.waitForExistence(timeout: 5))
        XCTAssertFalse(window.descendants(matching: .any)["compass-event-form"].exists)
    }
}
