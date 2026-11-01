import CompassKit
import XCTest

final class WelcomeBodyKeyboardTests: XCTestCase {
    @MainActor
    func testEnterAdvancesAfterClickingWelcomeHeading() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-\(OnboardingStorageKeys.hasSeenWelcome)", "false",
            "-compass.theme", "light-beach",
        ]
        app.launch()
        defer { app.terminate() }
        let window = app.windows["Compass"]
        let modal = window.descendants(matching: .any)["compass-native-welcome-modal"]
        XCTAssertTrue(modal.waitForExistence(timeout: 10))
        let heading = modal.staticTexts["The Keyboard Calendar"]
        XCTAssertTrue(heading.exists)
        heading.click()
        window.typeKey(.return, modifierFlags: [])
        XCTAssertTrue(modal.staticTexts["How Compass works"].waitForExistence(timeout: 5))
        XCTAssertTrue(modal.buttons["Next"].exists)
        XCTAssertFalse(modal.staticTexts["The Keyboard Calendar"].exists)
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Welcome second step after heading click and Enter"
        evidence.lifetime = .keepAlways
        add(evidence)
    }
}
