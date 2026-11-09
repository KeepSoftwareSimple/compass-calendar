import XCTest

final class EventFormFooterMoreDisclosureTests: XCTestCase {
    @MainActor
    func testMoreDisclosureExpandsSecondaryHintsAndReportsExpandedState() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", "light-beach"]
        app.launch()
        app.activate()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey("c", modifierFlags: [])
        let footer = window.descendants(matching: .any)["compass-event-form-footer-tips"].firstMatch
        XCTAssertTrue(footer.waitForExistence(timeout: 8))

        let more = window.buttons["compass-event-form-footer-hints-more"].firstMatch
        XCTAssertTrue(more.waitForExistence(timeout: 4))
        XCTAssertEqual(more.value as? String, "Collapsed")

        XCTAssertFalse(window.staticTexts["for actions"].waitForExistence(timeout: 0.5))
        more.click()

        let less = window.buttons["compass-event-form-footer-hints-less"].firstMatch
        XCTAssertTrue(less.waitForExistence(timeout: 4))
        XCTAssertEqual(less.value as? String, "Expanded")
        XCTAssertTrue(window.staticTexts["for actions"].waitForExistence(timeout: 4))

        app.terminate()
    }
}
