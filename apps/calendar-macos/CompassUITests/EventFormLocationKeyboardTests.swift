import XCTest

final class EventFormLocationKeyboardTests: XCTestCase {
    @MainActor
    func testRepeatedLocationShortcutRestoresFocusAfterTabInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            window.typeKey("c", modifierFlags: [])
            let location = window.textFields["compass-event-form-location"]
            XCTAssertTrue(location.waitForExistence(timeout: 8))
            window.typeKey("7", modifierFlags: [.command])
            XCTAssertTrue(location.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, location.debugDescription)
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(location.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, location.debugDescription)
            window.typeKey("7", modifierFlags: [.command])
            XCTAssertTrue(location.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, location.debugDescription)
            XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].exists)
            app.terminate()
        }
    }
}
