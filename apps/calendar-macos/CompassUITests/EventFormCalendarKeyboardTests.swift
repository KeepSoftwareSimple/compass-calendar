import XCTest

final class EventFormCalendarKeyboardTests: XCTestCase {
    @MainActor
    func testCalendarShortcutOpensMenuAndRepeatedJumpReturnsFocusInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            window.typeKey("c", modifierFlags: [])
            let calendar = window.descendants(matching: .any)["compass-event-form-calendar"]
            XCTAssertTrue(calendar.waitForExistence(timeout: 8))
            window.typeKey("5", modifierFlags: [.command])
            XCTAssertTrue(calendar.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, calendar.debugDescription)
            window.typeKey(.tab, modifierFlags: [])
            XCTAssertFalse(calendar.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, window.debugDescription)
            window.typeKey(.tab, modifierFlags: [.shift])
            XCTAssertTrue(calendar.debugDescription.split(separator: "\n").first?.contains("Keyboard Focused") == true, calendar.debugDescription)
            window.typeKey(.space, modifierFlags: [])
            let choice = app.menuItems["Compass (primary)"]
            XCTAssertTrue(choice.waitForExistence(timeout: 5))
            window.typeKey(.return, modifierFlags: [])
            XCTAssertTrue(choice.waitForNonExistence(timeout: 5))
            window.typeKey("1", modifierFlags: [.command])
            window.typeKey("5", modifierFlags: [.command])
            window.typeKey(.space, modifierFlags: [])
            XCTAssertTrue(choice.waitForExistence(timeout: 5))
            window.typeKey(.escape, modifierFlags: [])
            XCTAssertTrue(choice.waitForNonExistence(timeout: 5))
            XCTAssertTrue(window.descendants(matching: .any)["compass-event-form"].exists)
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Calendar menu keyboard focus, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            app.terminate()
        }
    }
}
