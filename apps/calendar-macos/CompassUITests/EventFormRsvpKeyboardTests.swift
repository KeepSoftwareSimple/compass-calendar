import XCTest

final class EventFormRsvpKeyboardTests: XCTestCase {
    @MainActor
    func testRsvpJumpArrowsAndActivationOpenScopeWithoutSavingInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += [
                "-COMPASS_FIXTURE", "demo-attendee", "-compass.theme", theme,
                "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
                "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
            ]
            app.launch()
            let window = app.windows["Compass"]
            let going = window.buttons["Going"]
            XCTAssertTrue(going.waitForExistence(timeout: 8))
            window.typeKey("-", modifierFlags: [.command])
            XCTAssertTrue(going.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, going.debugDescription)
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "RSVP keyboard focus, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            window.typeKey(.rightArrow, modifierFlags: [])
            let scope = window.descendants(matching: .any)["compass-rsvp-scope-dialog"]
            XCTAssertTrue(scope.waitForExistence(timeout: 5), "RSVP scope should open from the focused response")
            window.typeKey(.escape, modifierFlags: [])
            XCTAssertTrue(scope.waitForNonExistence(timeout: 5))
            window.typeKey(.space, modifierFlags: [])
            XCTAssertEqual(window.textFields.matching(identifier: "compass-event-form-title").matching(NSPredicate(format: "enabled == true")).firstMatch.value as? String, "Morning standup")
            XCTAssertTrue(scope.waitForExistence(timeout: 5), "RSVP scope should open from the focused response")
            window.typeKey(.escape, modifierFlags: [])
            XCTAssertTrue(scope.waitForNonExistence(timeout: 5))
            window.typeKey(.return, modifierFlags: [])
            XCTAssertTrue(scope.waitForExistence(timeout: 5), "RSVP scope should open from the focused response")
            window.typeKey(.escape, modifierFlags: [])
            XCTAssertTrue(scope.waitForNonExistence(timeout: 5))
            window.typeKey("e", modifierFlags: [])
            window.typeKey("g", modifierFlags: [])
            XCTAssertTrue(going.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, going.debugDescription)
            window.typeKey(.tab, modifierFlags: [])
            for label in ["Going", "Maybe", "Decline"] {
                XCTAssertFalse(window.buttons[label].debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, window.debugDescription)
            }
            window.typeKey(.tab, modifierFlags: [.shift])
            XCTAssertTrue(going.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, going.debugDescription)
            XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].exists)
            app.terminate()
        }
    }
}
