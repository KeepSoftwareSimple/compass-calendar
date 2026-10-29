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
}
