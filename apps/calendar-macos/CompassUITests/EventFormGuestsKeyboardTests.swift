import XCTest

final class EventFormGuestsKeyboardTests: XCTestCase {
    @MainActor
    func testRepeatedGuestsShortcutRestoresFocusAfterTabInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            window.typeKey("c", modifierFlags: [])
            let guests = window.textFields["compass-event-form-attendees"]
            XCTAssertTrue(guests.waitForExistence(timeout: 8))
            window.typeKey("8", modifierFlags: [.command])
            XCTAssertTrue(guests.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, guests.debugDescription)
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(guests.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, guests.debugDescription)
            window.typeKey("8", modifierFlags: [.command])
            XCTAssertTrue(guests.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, guests.debugDescription)
            XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].exists)
            app.terminate()
        }
    }
}
