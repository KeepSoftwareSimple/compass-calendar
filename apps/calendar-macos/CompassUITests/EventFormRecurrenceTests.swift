import XCTest

final class EventFormRecurrenceTests: XCTestCase {
    @MainActor
    func testRecurrenceJumpMovesRealFocusAndRepeatedJumpActivatesInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += [
                "-COMPASS_FIXTURE", "demo", "-compass.theme", theme,
            ]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            window.typeKey("c", modifierFlags: [])
            let toggle = window.buttons["compass-event-form-recurrence-toggle"]
            XCTAssertTrue(toggle.waitForExistence(timeout: 8))
            window.typeKey("4", modifierFlags: [.command])
            window.typeKey(.space, modifierFlags: [])
            let frequency = window.descendants(matching: .any)["compass-event-form-recurrence-frequency"]
            XCTAssertTrue(frequency.waitForExistence(timeout: 5))
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(toggle.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true)
            window.typeKey(.tab, modifierFlags: [.shift])
            XCTAssertTrue(toggle.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, toggle.debugDescription)
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(toggle.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true)
            window.typeKey("4", modifierFlags: [.command])
            XCTAssertTrue(toggle.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, toggle.debugDescription)
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Recurrence keyboard focus, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            window.typeKey(.return, modifierFlags: [])
            XCTAssertTrue(frequency.waitForNonExistence(timeout: 5))
            XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].exists)
            app.terminate()
        }
    }

    @MainActor
    func testRecurrenceEndDateCanBeEnabledAndRemoved() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
            "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
        ]
        app.launch()
        let window = app.windows["Compass"]
        let repeatToggle = window.descendants(matching: .any)["compass-event-form-recurrence-toggle"]
        XCTAssertTrue(repeatToggle.waitForExistence(timeout: 8))
        window.typeKey("4", modifierFlags: [.command])
        repeatToggle.click()
        let frequency = window.descendants(matching: .any)["compass-event-form-recurrence-frequency"]
        XCTAssertEqual(frequency.value as? String, "Daily")
        frequency.click()
        app.menuItems["Yearly"].click()
        XCTAssertEqual(frequency.value as? String, "Yearly")
        frequency.click()
        app.menuItems["Weekly"].click()
        let tuesday = window.buttons["Tuesday"]
        XCTAssertTrue(tuesday.exists)
        XCTAssertTrue(window.buttons["Thursday"].exists)
        let selected = tuesday.value as? String == "Selected"
        tuesday.click()
        XCTAssertEqual(tuesday.value as? String, selected ? "Not selected" : "Selected")
        let endToggle = window.descendants(matching: .any)["compass-event-form-recurrence-has-until"]
        XCTAssertTrue(endToggle.exists)
        let endDate = window.descendants(matching: .any)["compass-event-form-recurrence-until"]
        XCTAssertFalse(endDate.exists)
        endToggle.click()
        XCTAssertTrue(endDate.exists)
        XCTAssertTrue(endDate.isHittable)
        let scroll = window.scrollViews.containing(.any, identifier: "compass-event-form-recurrence-toggle").element
        XCTAssertTrue(scroll.exists)
        XCTAssertLessThanOrEqual(endDate.frame.maxY, scroll.frame.maxY)
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Recurrence end date enabled"
        evidence.lifetime = .keepAlways
        add(evidence)
        endToggle.click()
        XCTAssertFalse(endDate.exists)
    }
}
