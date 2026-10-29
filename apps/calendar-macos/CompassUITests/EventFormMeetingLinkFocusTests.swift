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
            let conference = form.descendants(matching: .any)["compass-event-form-conference"]
            XCTAssertTrue(conference.waitForExistence(timeout: 8))
            XCTAssertTrue(
                conference.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true,
                conference.debugDescription)
            XCTAssertTrue(form.exists)
            app.terminate()
        }
    }
}
