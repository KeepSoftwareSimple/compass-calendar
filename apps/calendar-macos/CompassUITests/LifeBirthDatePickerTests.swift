import XCTest

final class LifeBirthDatePickerTests: XCTestCase {
    @MainActor
    func testCaptionPickerWalksYearThenMonthThenDay() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey("l", modifierFlags: [])
        let birth = window.textFields["Date of birth"]
        XCTAssertTrue(birth.waitForExistence(timeout: 10))
        let open = window.buttons["Open calendar"]
        XCTAssertTrue(open.waitForExistence(timeout: 5))
        open.click()

        let picker = app.descendants(matching: .any)["compass-life-birth-date-picker"]
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        picker.buttons["Choose month and year"].click()
        XCTAssertTrue(picker.buttons["Previous years"].waitForExistence(timeout: 5))
        let yearCaption = picker.staticTexts["Years 2021 to 2040"]
        XCTAssertTrue(yearCaption.waitForExistence(timeout: 5))
        XCTAssertTrue(picker.buttons["2021"].exists)
        XCTAssertTrue(picker.buttons["2040"].exists)
        // Twenty-year react-aligned pages; step back until 1990 is on it.
        for _ in 0 ..< 6 where !picker.buttons["1990"].exists {
            picker.buttons["Previous years"].click()
        }
        XCTAssertTrue(picker.buttons["1990"].waitForExistence(timeout: 3))
        picker.buttons["1990"].click()
        XCTAssertTrue(picker.staticTexts["Select month, 1990"].waitForExistence(timeout: 3))
        picker.buttons["Jun"].click()
        let day = picker.buttons["Friday, June 15, 1990"]
        XCTAssertTrue(day.waitForExistence(timeout: 3))
        day.click()

        XCTAssertFalse(picker.waitForExistence(timeout: 2))
        XCTAssertEqual(birth.value as? String, "Jun 15, 1990")
        XCTAssertTrue(
            app.descendants(matching: .any)["compass-life-birth-date-focused"].waitForExistence(timeout: 3))
    }

    @MainActor
    func testBirthDatePickerEscapeRestoresBirthFieldFocus() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey("l", modifierFlags: [])
        let birth = window.textFields["Date of birth"]
        XCTAssertTrue(birth.waitForExistence(timeout: 10))
        window.buttons["Open calendar"].click()
        let picker = app.descendants(matching: .any)["compass-life-birth-date-picker"]
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        window.typeKey(.escape, modifierFlags: [])
        XCTAssertFalse(picker.waitForExistence(timeout: 2))
        XCTAssertTrue(
            app.descendants(matching: .any)["compass-life-birth-date-focused"].waitForExistence(timeout: 3))
    }

    @MainActor
    func testFutureYearsAreDisabled() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey("l", modifierFlags: [])
        let birth = window.textFields["Date of birth"]
        XCTAssertTrue(birth.waitForExistence(timeout: 10))
        let open = window.buttons["Open calendar"]
        XCTAssertTrue(open.waitForExistence(timeout: 5))
        open.click()
        let picker = app.descendants(matching: .any)["compass-life-birth-date-picker"]
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        picker.buttons["Choose month and year"].click()
        // The picker opens on any saved birth date, so page forward to the demo
        // clock's year (June 2026). 2027 is after "today", so it is disabled.
        for _ in 0 ..< 8 where !picker.buttons["2027"].exists {
            picker.buttons["Next years"].click()
        }
        let future = picker.buttons["2027"]
        XCTAssertTrue(future.waitForExistence(timeout: 3))
        XCTAssertFalse(future.isEnabled)
        XCTAssertTrue(picker.buttons["2026"].isEnabled)
    }
}
