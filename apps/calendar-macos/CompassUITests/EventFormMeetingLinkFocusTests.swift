import XCTest

final class EventFormMeetingLinkFocusTests: XCTestCase {
    @MainActor
    func testMeetingLinkShortcutMovesActualFocusInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += [
                "-COMPASS_FIXTURE", "demo", "-compass.theme", theme,
                "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
                "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
            ]
            app.launch()
            let window = app.windows["Compass"]
            let form = window.descendants(matching: .any)["compass-event-form"]
            XCTAssertTrue(form.waitForExistence(timeout: 12))
            window.typeKey("=", modifierFlags: [.command])
            let conference = form.links["compass-event-form-conference"]
            XCTAssertTrue(conference.waitForExistence(timeout: 8))
            XCTAssertTrue(
                conference.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true,
                conference.debugDescription)
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(conference.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true)
            window.typeKey("=", modifierFlags: [.command])
            XCTAssertTrue(conference.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true)
            let viewport = form.scrollViews.firstMatch.frame
            XCTAssertGreaterThan(conference.frame.height, 0)
            XCTAssertTrue(viewport.contains(conference.frame), "Focused link must fit inside the scrolling viewport")
            XCTAssertLessThanOrEqual(conference.frame.maxY, form.buttons["compass-event-form-save"].frame.minY)
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Meeting link keyboard focus, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            XCTAssertTrue(form.exists)
            app.terminate()
        }
    }
}
