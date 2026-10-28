import XCTest

final class SidebarMonthPickerTests: XCTestCase {
    @MainActor
    func testBrowsingMonthsDoesNotMoveCalendarWindow() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            let picker = window.descendants(matching: .any)["compass-native-month-picker"]
            XCTAssertTrue(picker.waitForExistence(timeout: 10))
            let title = window.buttons["compass-native-header-title"]
            let originalTitle = title.label
            let originalMonth = picker.staticTexts.element(boundBy: 0).value as? String

            picker.buttons["Next month"].click()
            XCTAssertNotNil(originalMonth)
            XCTAssertNotEqual(picker.staticTexts.element(boundBy: 0).value as? String, originalMonth)
            XCTAssertEqual(title.label, originalTitle)
            picker.buttons["Previous month"].click()
            XCTAssertEqual(picker.staticTexts.element(boundBy: 0).value as? String, originalMonth)

            picker.buttons["Next month"].click()
            XCTAssertNotEqual(picker.staticTexts.element(boundBy: 0).value as? String, originalMonth)
            let goToThisMonth = picker.buttons["Go to this month"]
            XCTAssertTrue(goToThisMonth.waitForExistence(timeout: 2))
            XCTAssertTrue(goToThisMonth.isEnabled)
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Month navigation and today dot, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            goToThisMonth.click()
            XCTAssertEqual(picker.staticTexts.element(boundBy: 0).value as? String, originalMonth)
            XCTAssertEqual(title.label, originalTitle)
            app.terminate()
        }
    }
    @MainActor
    func testMonthChordKeepsPickerFocusForArrowNavigationAndCommit() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 10))
        let title = window.buttons["compass-native-header-title"]
        let originalTitle = title.label
        window.typeKey("i", modifierFlags: [])
        window.typeKey("k", modifierFlags: [.command, .option])
        window.typeKey(.rightArrow, modifierFlags: [])
        XCTAssertEqual(title.label, originalTitle)
        window.typeKey(.return, modifierFlags: [])
        XCTAssertNotEqual(title.label, originalTitle)
    }

}
