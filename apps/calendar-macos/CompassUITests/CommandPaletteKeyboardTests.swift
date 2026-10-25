import XCTest

final class CommandPaletteKeyboardTests: XCTestCase {
    @MainActor
    func testEscapeFromSearchClosesPaletteAndReleasesKeyboard() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            window.typeKey("k", modifierFlags: [.command])
            let search = window.textFields["compass-native-command-palette-search"]
            XCTAssertTrue(search.waitForExistence(timeout: 8))
            search.typeText("today")
            search.typeKey(.escape, modifierFlags: [])
            let palette = window.descendants(matching: .any)["compass-native-command-palette"]
            XCTAssertTrue(palette.waitForNonExistence(timeout: 5))
            window.typeKey("?", modifierFlags: [])
            XCTAssertTrue(window.groups["compass-native-shortcuts-panel"].waitForExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testBackdropClickClosesPalette() {
        for theme in ["light-beach", "dark-abyss"] {
            let app = XCUIApplication.compassUITest()
            app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
            app.launch()
            let window = app.windows["Compass"]
            XCTAssertTrue(window.waitForExistence(timeout: 15))
            window.typeKey("k", modifierFlags: [.command])
            let palette = window.descendants(matching: .any)["compass-native-command-palette"]
            XCTAssertTrue(palette.waitForExistence(timeout: 8))
            let evidence = XCTAttachment(screenshot: window.screenshot())
            evidence.name = "Command palette modal backdrop, \(theme)"
            evidence.lifetime = .keepAlways
            add(evidence)
            window.coordinate(withNormalizedOffset: .zero)
                .withOffset(CGVector(dx: 20, dy: 200))
                .click()
            XCTAssertTrue(palette.waitForNonExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testArrowSelectionCreatesTheSelectedAllDayEvent() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        window.typeKey("k", modifierFlags: [.command])
        let search = window.textFields["compass-native-command-palette-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 8))
        search.typeText("create")
        let timed = window.buttons["compass-native-palette-item-create-event"]
        let allDay = window.buttons["compass-native-palette-item-create-allday-event"]
        XCTAssertTrue(timed.exists)
        for _ in 0..<24 {
            if timed.value as? String == "Selected" { break }
            window.typeKey(.downArrow, modifierFlags: [])
        }
        XCTAssertEqual(timed.value as? String, "Selected")
        window.typeKey(.downArrow, modifierFlags: [])
        XCTAssertEqual(allDay.value as? String, "Selected")
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Command palette keyboard selection"
        evidence.lifetime = .keepAlways
        add(evidence)
        window.typeKey(.return, modifierFlags: [])
        XCTAssertFalse(search.exists)
        let title = window.textFields["compass-event-form-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        let toggle = window.descendants(matching: .any)["compass-event-form-allday"]
        XCTAssertEqual((toggle.value as? NSNumber)?.intValue, 1)
    }

    @MainActor
    func testPaletteFitsShortResultsAndExpandsWhenCleared() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        window.typeKey("k", modifierFlags: [.command])
        let palette = window.descendants(matching: .any)["compass-native-command-palette"]
        let search = window.textFields["compass-native-command-palette-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 8))
        let fullHeight = palette.frame.height
        search.typeText("create")
        XCTAssertTrue(window.buttons["compass-native-palette-item-create-event"].exists)
        XCTAssertLessThan(palette.frame.height, fullHeight)
        search.typeKey("a", modifierFlags: [.command])
        search.typeKey(.delete, modifierFlags: [])
        XCTAssertEqual(palette.frame.height, fullHeight, accuracy: 1)
    }

    @MainActor
    func testFileNewEventOpensTheNativeForm() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.staticTexts["Morning standup"].waitForExistence(timeout: 8))
        app.menuBars.menuBarItems["File"].click()
        app.menuItems["New Event"].click()
        XCTAssertTrue(app.windows["Compass"].textFields["compass-event-form-title"].waitForExistence(timeout: 8))
    }
}
