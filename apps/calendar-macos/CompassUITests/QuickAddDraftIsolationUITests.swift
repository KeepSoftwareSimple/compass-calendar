import XCTest

final class QuickAddDraftIsolationUITests: XCTestCase {
    @MainActor
    func testCancellingPanelKeepsTheMainFormTitle() {
        let app = launchWithForm()
        let window = app.windows["Compass"]
        let title = window.textFields["compass-event-form-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        title.typeKey("a", modifierFlags: [.command])
        title.typeText("Keep this draft")
        let panel = openPanel(app)
        let field = panel.textFields["compass-native-quick-add-field"]
        field.typeText("Cancel this panel entry")
        panel.typeKey(.escape, modifierFlags: [])
        XCTAssertFalse(field.exists)
        XCTAssertTrue(title.exists)
        XCTAssertEqual(title.value as? String, "Keep this draft")
    }

    @MainActor
    func testSavingPanelKeepsTheMainFormTitle() {
        let app = launchWithForm()
        let window = app.windows["Compass"]
        let title = window.textFields["compass-event-form-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        title.typeKey("a", modifierFlags: [.command])
        title.typeText("Keep editing this event")
        let panel = openPanel(app)
        let field = panel.textFields["compass-native-quick-add-field"]
        field.typeText("Separate panel event")
        panel.typeKey(.return, modifierFlags: [])
        XCTAssertFalse(field.waitForExistence(timeout: 2))
        XCTAssertTrue(title.exists)
        XCTAssertEqual(title.value as? String, "Keep editing this event")
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Main draft preserved after Quick Add"
        evidence.lifetime = .keepAlways
        add(evidence)
    }

    @MainActor
    func testInvalidTimeStaysOpenAndCanBeCorrected() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-COMPASS_UI_TEST_STICKY_QUICK_ADD_PANEL"]
        app.launch()
        let panel = openPanel(app)
        let field = panel.textFields["compass-native-quick-add-field"]
        field.typeText("2599")
        panel.typeKey(.return, modifierFlags: [])
        XCTAssertTrue(field.exists)
        let hint = panel.staticTexts["compass-native-quick-add-time-hint"]
        XCTAssertTrue(hint.waitForExistence(timeout: 8))
        XCTAssertEqual(hint.value as? String, "Enter a valid time from 0000 to 2359.")
        field.typeKey("a", modifierFlags: [.command])
        field.typeText("1130")
        panel.typeKey(.return, modifierFlags: [])
        XCTAssertFalse(field.waitForExistence(timeout: 2))
        XCTAssertTrue(app.windows["Compass"].buttons["Untitled event"].waitForExistence(timeout: 8))
    }

    @MainActor
    private func launchWithForm() -> XCUIApplication {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo", "-COMPASS_UI_TEST_STICKY_QUICK_ADD_PANEL",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
        ]
        app.launch()
        return app
    }

    @MainActor
    private func openPanel(_ app: XCUIApplication) -> XCUIElement {
        app.menuBars.menuBarItems["Debug"].click()
        app.menuItems["Open Quick Add Panel"].click()
        let panel = app.windows["compass-native-quick-add-window"]
        XCTAssertTrue(panel.waitForExistence(timeout: 8))
        XCTAssertTrue(panel.textFields["compass-native-quick-add-field"].waitForExistence(timeout: 8))
        return panel
    }
}
