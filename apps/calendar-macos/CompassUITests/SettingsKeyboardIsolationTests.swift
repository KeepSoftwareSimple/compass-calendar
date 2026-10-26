import XCTest

final class SettingsKeyboardIsolationTests: XCTestCase {
    @MainActor
    func testSettingsInitiallyFocusesCurrentPageAndTabReturnsInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            window.typeKey(",", modifierFlags: [.command])
            let accounts = window.buttons["Accounts"]
            XCTAssertTrue(accounts.waitForExistence(timeout: 8))
            let focused = NSPredicate { _, _ in accounts.debugDescription.contains("Keyboard Focused") }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: focused, object: nil)], timeout: 5), .completed)
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Settings navigation focus, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            window.typeKey(.tab, modifierFlags: [])
            let traversal = XCTAttachment(string: window.debugDescription)
            traversal.name = "Settings focus after Tab, \(theme)"
            traversal.lifetime = .keepAlways
            add(traversal)
            XCTAssertFalse(accounts.debugDescription.contains("Keyboard Focused"), window.debugDescription)
            window.typeKey(.tab, modifierFlags: [.shift])
            XCTAssertTrue(accounts.debugDescription.contains("Keyboard Focused"))
            window.typeKey(.escape, modifierFlags: [])
            XCTAssertTrue(window.descendants(matching: .any)["compass-native-settings"].waitForNonExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testBackdropAndEscapeCloseSettingsInBothThemes() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            window.typeKey(",", modifierFlags: [.command])
            let settings = window.descendants(matching: .any)["compass-native-settings"]
            XCTAssertTrue(settings.waitForExistence(timeout: 8))
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Settings modal backdrop, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            window.coordinate(withNormalizedOffset: .zero)
                .withOffset(CGVector(dx: 20, dy: 200))
                .click()
            XCTAssertTrue(settings.waitForNonExistence(timeout: 5))
            window.typeKey(",", modifierFlags: [.command])
            XCTAssertTrue(settings.waitForExistence(timeout: 8))
            window.typeKey(.escape, modifierFlags: [])
            XCTAssertTrue(settings.waitForNonExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testSettingsDoesNotCreateAnEventBehindTheDialog() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey(",", modifierFlags: .command)
        let settings = window.descendants(matching: .any)["compass-native-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        window.typeKey("c", modifierFlags: [])
        window.typeKey(.escape, modifierFlags: [])
        XCTAssertFalse(settings.exists)
        XCTAssertFalse(window.descendants(matching: .any)["compass-event-form"].exists)
        XCTAssertFalse(window.buttons["Untitled event"].exists)
        XCTAssertTrue(window.staticTexts["Morning standup"].exists)
    }

    @MainActor
    func testExportSavePanelOwnsTypingAndCanBeCancelled() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        // Match the compact window from the CI hit-testing regression.
        app.launchArguments += ["-NSWindow Frame CompassMainWindow", "0 0 720 630 0 0 1024 768 "]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertEqual(window.frame.width, 720, accuracy: 1)
        window.typeKey(",", modifierFlags: .command)
        let export = window.buttons["settings-export-data"]
        XCTAssertTrue(export.waitForExistence(timeout: 5))
        XCTAssertEqual(export.label, "Export data")
        XCTAssertTrue(export.isHittable)
        export.click()
        let sheet = window.sheets.firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 5))
        let filename = sheet.textFields.firstMatch
        XCTAssertTrue(filename.exists)
        filename.click()
        filename.typeKey("a", modifierFlags: .command)
        filename.typeText("calendar-backup.json")
        sheet.buttons["Cancel"].click()
        XCTAssertFalse(sheet.exists)
        window.typeKey(.escape, modifierFlags: [])
        XCTAssertFalse(window.descendants(matching: .any)["compass-event-form"].exists)
        XCTAssertFalse(window.buttons["Untitled event"].exists)
    }
}
