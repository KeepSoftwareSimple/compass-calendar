import CompassKit
import XCTest

final class AccessibilityIdentifierAuditTests: XCTestCase {
    @MainActor
    func testDemoWeekGridBaselineIdentifiersExist() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))

        for identifier in NativeUIAccessibilityCatalog.demoWeekGridBaseline where identifier != "Compass" {
            let element = window.descendants(matching: .any)[identifier]
            XCTAssertTrue(
                element.waitForExistence(timeout: 8),
                "Missing accessibility identifier \(identifier) on the demo week grid")
        }
    }

    @MainActor
    func testWelcomeModalIdentifierExistsOnFreshLaunch() {
        let app = XCUIApplication()
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        for identifier in NativeUIAccessibilityCatalog.welcome {
            XCTAssertTrue(
                window.descendants(matching: .any)[identifier].waitForExistence(timeout: 10),
                "Missing welcome identifier \(identifier)")
        }
    }
}
