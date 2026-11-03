import XCTest

final class EventFormTitleKeyboardTests: XCTestCase {
    @MainActor
    func testTitleShortcutRestoresFocusAfterTabInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            window.typeKey("c", modifierFlags: [])
            let form = window.descendants(matching: .any)["compass-event-form"]
            XCTAssertTrue(form.waitForExistence(timeout: 8))
            let title = form.textFields["compass-event-form-title"]
            XCTAssertTrue(title.waitForExistence(timeout: 8))
            XCTAssertTrue(title.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true)
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(title.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true)
            window.typeKey("1", modifierFlags: [.command])
            XCTAssertTrue(title.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, title.debugDescription)
            XCTAssertTrue(form.exists)
            app.terminate()
        }
    }

    @MainActor
    func testTitleEditSequenceReopensSavedEventWithItsTitleFocused() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
        ]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey("c", modifierFlags: [])
        let form = window.descendants(matching: .any)["compass-event-form"]
        XCTAssertTrue(form.waitForExistence(timeout: 8))
        let title = form.textFields["compass-event-form-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        let savedTitle = "Sequence edit acceptance"
        title.typeText(savedTitle)
        window.typeKey(.enter, modifierFlags: [.command])
        XCTAssertTrue(form.waitForNonExistence(timeout: 8))
        XCTAssertTrue(window.buttons[savedTitle].waitForExistence(timeout: 8))

        let focusedEvent = window.descendants(matching: .any)["compass-grid-event-focused"]
        let savedEventIsFocused = NSPredicate { _, _ in
            focusedEvent.exists && (focusedEvent.label == savedTitle || focusedEvent.value as? String == savedTitle)
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(
            predicate: savedEventIsFocused, object: nil)], timeout: 8), .completed)
        window.typeKey("e", modifierFlags: [])
        window.typeKey("t", modifierFlags: [])
        XCTAssertTrue(form.waitForExistence(timeout: 8))
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        XCTAssertTrue(title.isHittable)
        XCTAssertEqual(title.value as? String, savedTitle)
        XCTAssertTrue(title.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true,
            "E then T must focus the existing title input")
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Saved event reopened by E then T with title focus"
        evidence.lifetime = .keepAlways
        add(evidence)
    }
}
