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
            let title = window.descendants(matching: .any)["compass-event-form-title"].firstMatch
            XCTAssertTrue(title.waitForExistence(timeout: 8))
            XCTAssertTrue(title.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true)
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(title.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true)
            window.typeKey("1", modifierFlags: [.command])
            XCTAssertTrue(title.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, title.debugDescription)
            XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].exists)
            app.terminate()
        }
    }
}
