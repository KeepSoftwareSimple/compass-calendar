import CompassKit
import XCTest

final class WelcomeKeyboardTests: XCTestCase {
    @MainActor
    func testWelcomeStepsRemainInteractiveInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += [
                "-\(OnboardingStorageKeys.hasSeenWelcome)", "false",
                "-compass.theme", theme,
            ]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            let modal = window.descendants(matching: .any)["compass-native-welcome-modal"]
            XCTAssertTrue(modal.waitForExistence(timeout: 10))
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Welcome backdrop, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)

            modal.buttons["Get started for free"].click()
            XCTAssertTrue(modal.staticTexts["How Compass works"].waitForExistence(timeout: 5))
            window.typeKey(.return, modifierFlags: [])
            XCTAssertTrue(modal.staticTexts["Let's get started"].waitForExistence(timeout: 5))
            modal.buttons["Back"].click()
            XCTAssertTrue(modal.staticTexts["How Compass works"].waitForExistence(timeout: 5))
            window.typeKey(.escape, modifierFlags: [])
            XCTAssertTrue(modal.staticTexts["The Keyboard Calendar"].waitForExistence(timeout: 5))
            app.terminate()
        }
    }
}
