import XCTest

final class EventFormFooterLayoutTests: XCTestCase {
    @MainActor
    func testLightFooterKeepsInstructionWordsOnOneLine() {
        assertFooter(theme: "light-beach")
    }

    @MainActor
    func testDarkFooterKeepsInstructionWordsOnOneLine() {
        assertFooter(theme: "dark-abyss")
    }

    @MainActor
    private func assertFooter(theme: String) {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
        app.launch()
        app.activate()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey("c", modifierFlags: [])
        let footer = window.descendants(matching: .any)["compass-event-form-footer-tips"].firstMatch
        XCTAssertTrue(footer.waitForExistence(timeout: 8))
        let betweenFields = window.staticTexts["between fields"]
        XCTAssertTrue(betweenFields.exists)
        XCTAssertLessThan(betweenFields.frame.height, 20)
        let more = window.buttons["compass-event-form-footer-hints-more"].firstMatch
        XCTAssertTrue(more.waitForExistence(timeout: 4))
        XCTAssertLessThan(more.frame.height, 20)
        more.click()
        for label in ["Hold", "then", "for actions"] {
            let instruction = window.staticTexts[label]
            XCTAssertTrue(instruction.waitForExistence(timeout: 4), label)
            XCTAssertLessThan(instruction.frame.height, 20, "Instruction must not wrap: \(label)")
            XCTAssertTrue(window.frame.contains(instruction.frame), label)
        }
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Event form footer, \(theme)"
        evidence.lifetime = .keepAlways
        add(evidence)
        app.terminate()
    }
}
