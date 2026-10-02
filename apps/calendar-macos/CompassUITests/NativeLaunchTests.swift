import XCTest

final class NativeLaunchTests: XCTestCase {
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
        let standup = window.buttons["Morning standup"]
        XCTAssertTrue(standup.waitForExistence(timeout: 10))
        standup.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()

        let focused = window.buttons.matching(
            NSPredicate(format: "identifier == %@ AND label == %@", "compass-grid-event-focused", "Morning standup")
        ).firstMatch
        XCTAssertTrue(focused.waitForExistence(timeout: 10))

        window.typeKey(.downArrow, modifierFlags: [])
        let tryCompass = window.buttons.matching(
            NSPredicate(format: "identifier == %@ AND label == %@", "compass-grid-event-focused", "Try Compass")
        ).firstMatch
        XCTAssertTrue(tryCompass.waitForExistence(timeout: 5))
    }

    @MainActor
    func testEventClickShowsPointerHintWithoutOpening() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES", "-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        let standup = window.buttons["Morning standup"]
        XCTAssertTrue(standup.waitForExistence(timeout: 10))
        standup.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()

        let hint = window.descendants(matching: .any)["compass-pointer-hint"]
        XCTAssertTrue(hint.waitForExistence(timeout: 5))
        XCTAssertFalse(window.descendants(matching: .any)["compass-event-form"].exists)
    }
}
