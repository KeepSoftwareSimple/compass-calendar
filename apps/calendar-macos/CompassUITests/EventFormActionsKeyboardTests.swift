import XCTest

final class EventFormActionsKeyboardTests: XCTestCase {
    @MainActor
    func testShiftEscapeDiscardsChangedEventWithoutPromptingOrSaving() {
        let app = launchForm(mirrorTitleTyping: true)
        let window = app.windows["Compass"]
        let title = window.textFields.matching(identifier: "compass-event-form-title")
            .matching(NSPredicate(format: "enabled == true")).firstMatch
        window.typeKey("a", modifierFlags: [.command])
        window.typeText("Unsaved edit")
        XCTAssertTrue(title.waitForExistence(timeout: 2))
        XCTAssertEqual(title.value as? String, "Unsaved edit")
        window.typeKey(.escape, modifierFlags: [.shift])
        XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].waitForNonExistence(timeout: 5))
        XCTAssertFalse(window.descendants(matching: .any)["compass-discard-draft-dialog"].exists)
        XCTAssertTrue(window.buttons["Morning standup"].exists)
        XCTAssertFalse(window.buttons["Unsaved edit"].exists)
    }

    @MainActor
    func testHeaderJumpTabsToCloseAndReturnPromptsInsteadOfSavingEdits() {
        let app = launchForm(mirrorTitleTyping: true)
        let window = app.windows["Compass"]
        let title = window.textFields.matching(identifier: "compass-event-form-title")
            .matching(NSPredicate(format: "enabled == true")).firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 2))
        title.click()
        title.typeKey("a", modifierFlags: [.command])
        title.typeText("Unsaved toolbar edit")
        XCTAssertEqual(title.value as? String, "Unsaved toolbar edit")
        window.typeKey("0", modifierFlags: [.command])
        window.typeKey(.tab, modifierFlags: [])
        window.typeKey(.tab, modifierFlags: [])
        let capture = XCTAttachment(screenshot: window.screenshot())
        capture.name = "Keyboard focus on Close"
        capture.lifetime = .keepAlways
        add(capture)
        window.typeKey(.return, modifierFlags: [])
        let form = window.descendants(matching: .any)["compass-event-form"]
        let confirmation = window.descendants(matching: .any)["compass-discard-draft-dialog"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))
        XCTAssertTrue(form.exists)
        window.typeKey(.escape, modifierFlags: [])
        XCTAssertTrue(confirmation.waitForNonExistence(timeout: 5))
        XCTAssertTrue(form.exists)
        window.typeKey(.escape, modifierFlags: [.shift])
        XCTAssertTrue(form.waitForNonExistence(timeout: 5))
        XCTAssertTrue(window.buttons["Morning standup"].exists)
    }

    @MainActor
    func testRepeatedHeaderJumpReturnsToDuplicateAndSpaceActivatesIt() {
        let app = launchForm()
        let window = app.windows["Compass"]
        window.typeKey("0", modifierFlags: [.command])
        window.typeKey(.tab, modifierFlags: [])
        window.typeKey("0", modifierFlags: [.command])
        window.typeKey(.space, modifierFlags: [])
        XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].waitForNonExistence(timeout: 5))
        let grid = window.descendants(matching: .any)["compass-grid-timed"]
        let copies = grid.buttons.matching(NSPredicate(format: "label == %@", "Morning standup"))
        let duplicated = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in copies.count == 2 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [duplicated], timeout: 5), .completed)
        window.typeKey("z", modifierFlags: [.command])
        let undone = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in copies.count == 1 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [undone], timeout: 5), .completed)
        window.typeKey("z", modifierFlags: [.command, .shift])
        let redone = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in copies.count == 2 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [redone], timeout: 5), .completed)
    }

    @MainActor
    private func launchForm(mirrorTitleTyping: Bool = false) -> XCUIApplication {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
        ]
        if mirrorTitleTyping {
            app.launchArguments += ["-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM"]
        }
        app.launch()
        let window = app.windows["Compass"]
        if !mirrorTitleTyping {
            XCTAssertTrue(window.descendants(matching: .any)["compass-grid-event-focused"].waitForExistence(timeout: 8))
            window.typeKey(.return, modifierFlags: [])
        }
        XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].waitForExistence(timeout: 8))
        return app
    }
}
