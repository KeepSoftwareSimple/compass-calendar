import XCTest

final class NativeLaunchTests: XCTestCase {
    /// AppKit cards report 0×0 frames in CI. Normalized center clicks the origin (often the content edge),
    /// which misses the card and only shows the grid scroll hint. Nudge into the timed column interior.
    @MainActor
    private func clickGridEvent(_ element: XCUIElement) {
        element.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: 90, dy: 28))
            .click()
    }

    @MainActor
    private func waitForFocusedGridEvent(title: String, in window: XCUIElement, timeout: TimeInterval) {
        let probe = window.descendants(matching: .any)["compass-grid-event-focused"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if probe.exists {
                if probe.label == title { return }
                if probe.value as? String == title { return }
            }
            if window.value as? String == title {
                return
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        let probeLabel = probe.exists ? probe.label : "(missing)"
        let probeValue = probe.exists ? String(describing: probe.value) : "(missing)"
        let windowValue = String(describing: window.value)
        XCTFail(
            "Expected focused grid event \"\(title)\"; "
                + "probe label=\(probeLabel), probe value=\(probeValue), window value=\(windowValue)")
    }

    @MainActor
    func testAnonymousLaunchShowsAuthModal() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-auth-modal"].waitForExistence(timeout: 10))
    }

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
    func testLifeViewSwitchAndBack() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES", "-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.staticTexts["Morning standup"].waitForExistence(timeout: 10),
            "Expected demo fixture week grid before switching to Life view")

        window.typeKey("l", modifierFlags: [])
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-life-grid"].waitForExistence(timeout: 5))
        XCTAssertTrue(window.staticTexts["Life"].waitForExistence(timeout: 3))

        window.typeKey("w", modifierFlags: [])
        XCTAssertTrue(
            window.staticTexts["Morning standup"].waitForExistence(timeout: 10),
            "Expected demo fixture week grid after leaving Life view")
        XCTAssertFalse(
            window.descendants(matching: .any)["compass-native-life-grid"].exists)
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
        app.launchArguments += [
            "-COMPASS_NATIVE_UI", "YES",
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
        ]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        waitForFocusedGridEvent(title: "Morning standup", in: window, timeout: 10)

        window.typeKey(.downArrow, modifierFlags: [])
        waitForFocusedGridEvent(title: "Try Compass", in: window, timeout: 10)
    }

    @MainActor
    func testKeyboardCreatesTimedDraftOnGrid() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES", "-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))

        window.typeKey(.downArrow, modifierFlags: [.shift])
        XCTAssertTrue(
            window.buttons["Untitled event"].waitForExistence(timeout: 5),
            "Expected keyboard-placed draft card on the grid")

        window.typeKey(.enter, modifierFlags: [])
        XCTAssertTrue(
            window.buttons["Untitled event"].waitForExistence(timeout: 10),
            "Expected saved event card after Enter")
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
