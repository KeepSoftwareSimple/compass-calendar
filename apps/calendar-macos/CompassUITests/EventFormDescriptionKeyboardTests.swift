import XCTest

final class EventFormDescriptionKeyboardTests: XCTestCase {
    @MainActor
    func testDescriptionShortcutAndTabDepartureInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            window.typeKey("c", modifierFlags: [])
            let form = window.descendants(matching: .any)["compass-event-form"]
            XCTAssertTrue(form.waitForExistence(timeout: 8))
            let description = form.textViews["compass-event-form-description"]
            window.typeKey("9", modifierFlags: [.command])
            XCTAssertTrue(description.waitForExistence(timeout: 8))
            XCTAssertTrue(description.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, description.debugDescription)
            let initialValue = description.value as? String
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(description.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, description.debugDescription)
            XCTAssertEqual(description.value as? String, initialValue, "Tab must leave the editor without changing its content")
            window.typeKey("9", modifierFlags: [.command])
            XCTAssertTrue(description.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, description.debugDescription)
            XCTAssertTrue(form.exists)
            app.terminate()
        }
    }
}
