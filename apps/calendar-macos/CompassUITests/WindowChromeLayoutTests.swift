import XCTest

final class WindowChromeLayoutTests: XCTestCase {
    @MainActor
    func testHeaderUsesTopChromeWithoutAnEmptyToolbarBand() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme, "-COMPASS_APP_URL", "https://compass.invalid"]
            app.launch()
            let window = app.windows["Compass"]
            let title = window.buttons["compass-native-header-title"]
            XCTAssertTrue(title.waitForExistence(timeout: 10))
            XCTAssertLessThan(title.frame.midY - window.frame.minY, 24,
                "The calendar header belongs in the top chrome, not below an empty toolbar")
            let previous = window.buttons["Previous"]
            let close = window.buttons[XCUIIdentifierCloseWindow]
            XCTAssertTrue(close.exists)
            XCTAssertGreaterThanOrEqual(previous.frame.minY - window.frame.minY, 4,
                "Header controls need breathing room below the top window edge")
            XCTAssertLessThanOrEqual(title.frame.height, 24)
            XCTAssertEqual(title.frame.midY, previous.frame.midY, accuracy: 2)
            XCTAssertEqual(title.frame.midY, close.frame.midY, accuracy: 3,
                "Navigation and title should share the traffic lights' horizontal row")
            XCTAssertLessThan(previous.frame.minX - window.frame.minX, 96,
                "Previous week control should sit in the unified title bar beside traffic lights")
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Calendar styling and top chrome, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            title.click()
            XCTAssertTrue(window.buttons["Day, D"].waitForExistence(timeout: 5))
            app.terminate()
        }
    }
}
