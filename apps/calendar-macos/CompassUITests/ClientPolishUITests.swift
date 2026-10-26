import XCTest

final class ClientPolishUITests: XCTestCase {
    @MainActor
    func testShortcutHelperAndCommandPaletteSharePanelWidth() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        window.typeKey("k", modifierFlags: [.command])
        let palette = window.descendants(matching: .any)["compass-native-command-palette"]
        XCTAssertTrue(palette.waitForExistence(timeout: 5))
        let width = palette.frame.width
        window.typeKey(.escape, modifierFlags: [])
        XCTAssertTrue(palette.waitForNonExistence(timeout: 5))
        window.typeKey("?", modifierFlags: [])
        let helper = window.groups["compass-native-shortcuts-panel"]
        XCTAssertTrue(helper.waitForExistence(timeout: 5))
        XCTAssertEqual(helper.frame.width, width, accuracy: 1)
    }

    @MainActor
    func testHoldingCommandRevealsHintsAndReleaseHidesThem() {
        let app = formApp()
        let form = app.windows["Compass"].descendants(matching: .any)["compass-event-form"]
        form.textFields["compass-event-form-title"].click()
        app.activate()
        let hints = app.windows["Compass"].descendants(matching: .any)["compass-form-field-digit-chips"]
        XCTAssertFalse(hints.exists)
        XCUIElement.perform(withKeyModifiers: [.command]) {
            XCTAssertTrue(hints.waitForExistence(timeout: 5))
            let evidence = XCTAttachment(screenshot: app.windows["Compass"].screenshot())
            evidence.name = "Command held hints"
            evidence.lifetime = .keepAlways
            add(evidence)
        }
        XCTAssertTrue(hints.waitForNonExistence(timeout: 5))
    }

    @MainActor
    func testReturnDoesNotSaveButCommandReturnDoes() {
        let app = formApp()
        let window = app.windows["Compass"]
        let form = window.descendants(matching: .any)["compass-event-form"]
        window.typeKey("a", modifierFlags: [.command])
        window.typeText("Saved only with Command Return")
        window.typeKey(.return, modifierFlags: [])
        XCTAssertTrue(form.exists)
        let grid = window.descendants(matching: .any)["compass-grid-timed"]
        window.typeKey(.return, modifierFlags: [.command])
        XCTAssertTrue(form.waitForNonExistence(timeout: 5))
        XCTAssertTrue(grid.buttons["Saved only with Command Return"].exists)
    }

    @MainActor
    func testTabLeavesDateFieldForStartTime() {
        let app = formApp()
        let window = app.windows["Compass"]
        let date = window.textFields["compass-event-form-start-date"]
        XCTAssertTrue(date.waitForExistence(timeout: 5))
        date.click()
        window.typeKey(.tab, modifierFlags: [])
        window.typeKey(.downArrow, modifierFlags: [])
        XCTAssertTrue(window.descendants(matching: .any)["compass-event-form-start-menu"].waitForExistence(timeout: 5))
        XCTAssertFalse(window.descendants(matching: .any)["compass-event-form-date-picker"].exists)
    }

    @MainActor
    func testClickingMonthPickerDayNavigatesCalendar() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        let picker = window.descendants(matching: .any)["compass-native-month-picker"]
        XCTAssertTrue(picker.waitForExistence(timeout: 8))
        let title = window.buttons["compass-native-header-title"]
        let before = title.label
        picker.buttons["Next month"].click()
        picker.buttons.matching(NSPredicate(format: "label CONTAINS %@", "July 15, 2026")).firstMatch.click()
        XCTAssertNotEqual(title.label, before)
    }

    @MainActor
    private func formApp() -> XCUIApplication {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM"]
        app.launch()
        XCTAssertTrue(app.windows["Compass"].descendants(matching: .any)["compass-event-form"].waitForExistence(timeout: 8))
        return app
    }
}
