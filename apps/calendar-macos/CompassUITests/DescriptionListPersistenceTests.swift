import XCTest

final class DescriptionListPersistenceTests: XCTestCase {
    @MainActor
    func testNumberedListContinuesExitsAndSurvivesSaveAndReopen() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
        ]
        app.launch()
        let window = app.windows["Compass"]
        let editor = window.textViews["compass-event-form-description"]
        XCTAssertTrue(editor.waitForExistence(timeout: 8))
        window.typeKey("9", modifierFlags: [.command])
        editor.click()
        editor.typeKey("a", modifierFlags: [.command])
        editor.typeKey(.delete, modifierFlags: [])
        let numberedList = window.checkBoxes["Numbered list"]
        XCTAssertTrue(numberedList.waitForExistence(timeout: 8))
        numberedList.click()
        for item in ["First item", "Second item", "Third item"] {
            editor.typeText(item)
            editor.typeKey(.return, modifierFlags: [])
        }
        editor.typeKey(.return, modifierFlags: [])
        editor.typeText("After list")
        let expected = "1. First item\n2. Second item\n3. Third item\nAfter list"
        XCTAssertEqual(editor.value as? String, expected)
        XCTAssertEqual(String(describing: numberedList.value ?? ""), "0")

        window.typeKey(.enter, modifierFlags: [.command])
        XCTAssertTrue(editor.waitForNonExistence(timeout: 8))
        window.typeKey(.return, modifierFlags: [])
        XCTAssertTrue(editor.waitForExistence(timeout: 8))
        window.typeKey("9", modifierFlags: [.command])
        XCTAssertEqual(editor.value as? String, expected)
        editor.typeKey(.upArrow, modifierFlags: [.command])
        for index in 1 ... 3 {
            XCTAssertEqual(String(describing: numberedList.value ?? ""), "1",
                "Saved item \(index) must retain actual ordered-list formatting")
            editor.typeKey(.downArrow, modifierFlags: [])
        }
        XCTAssertEqual(String(describing: numberedList.value ?? ""), "0",
            "The paragraph after the list must remain a normal paragraph")
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Numbered description list and following paragraph after reopening"
        evidence.lifetime = .keepAlways
        add(evidence)
    }
}
