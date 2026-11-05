import XCTest

final class NativeImageSnapshotTests: XCTestCase {
    @MainActor
    func testDemoWeekGridSnapshot() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        NativeImageSnapshotSupport.captureWindow(window, named: "demo-week-grid")
    }

    @MainActor
    func testDarkMonthPickerSnapshot() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", "dark-abyss"]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.descendants(matching: .any)["compass-native-month-picker"].waitForExistence(timeout: 10))
        window.typeKey("i", modifierFlags: [])
        NativeImageSnapshotSupport.captureWindow(window, named: "month-picker-dark")
    }

    @MainActor
    func testLifeViewSnapshot() { captureLife(theme: "light-beach") }

    @MainActor
    func testDarkLifeViewSnapshot() { captureLife(theme: "dark-abyss") }

    @MainActor
    private func captureLife(theme: String) {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo", "-compass.theme", theme]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        window.typeKey("l", modifierFlags: [])
        let intro = window.descendants(matching: .any)["compass-native-life-view-intro-modal"]
        if intro.waitForExistence(timeout: 2) {
            window.typeKey(.return, modifierFlags: [])
            XCTAssertTrue(intro.waitForNonExistence(timeout: 8))
        }
        let lifeGrid = window.descendants(matching: .any)["compass-native-life-grid"]
        XCTAssertTrue(lifeGrid.waitForExistence(timeout: 12))
        let birthField = window.textFields["Date of birth"]
        if !birthField.waitForExistence(timeout: 4) {
            for _ in 0 ..< 4 {
                window.scrollViews.firstMatch.swipeUp()
                if birthField.waitForExistence(timeout: 2) { break }
            }
        }
        XCTAssertTrue(
            birthField.waitForExistence(timeout: 10),
            "Expected life-view birth date field")
        XCTAssertTrue(
            window.textFields["Age of Death"].waitForExistence(timeout: 10),
            "Expected life-view age-of-death field")
        XCTAssertFalse(window.descendants(matching: .any)["compass-native-month-picker"].exists)
        XCTAssertFalse(window.descendants(matching: .any)["compass-native-demo-events-banner"].exists)
        XCTAssertFalse(window.descendants(matching: .any)["compass-native-up-next-banner"].exists)
        XCTAssertTrue(
            window.staticTexts[
                "Each dot represents one week of your life, and each row represents one year."
            ].waitForExistence(timeout: 10))
        if theme == "light-beach" {
            let birth = birthField
            let originalBirth = birth.value as? String ?? "2000-01-01"
            birth.click()
            birth.typeKey("a", modifierFlags: [.command])
            birth.typeText("2100-01-01")
            XCTAssertEqual(birth.value as? String, "2100-01-01")
            birth.typeKey(.return, modifierFlags: [])
            XCTAssertTrue(window.staticTexts["Enter a date from 1900 through today."].exists)
            birth.typeKey("a", modifierFlags: [.command])
            birth.typeText(originalBirth)
            birth.typeKey(.return, modifierFlags: [])
            XCTAssertFalse(window.staticTexts["Enter a date from 1900 through today."].exists)
            birth.typeKey(.escape, modifierFlags: [])
        }
        let gridValue = lifeGrid.value as? String ?? ""
        let weekMarker = window.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS[c] %@", "| week")
        ).firstMatch
        XCTAssertTrue(
            gridValue.contains("| week") || weekMarker.waitForExistence(timeout: 12),
            "Expected life-view week progress on grid or current-week label, grid value: \(gridValue)")
        NativeImageSnapshotSupport.captureWindow(window, named: "life-view-\(theme)")
    }

    @MainActor
    func testEventFormSnapshot() {
        let window = launchDemoWindow()
        window.typeKey("c", modifierFlags: [])
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-event-form"].waitForExistence(timeout: 8))
        NativeImageSnapshotSupport.captureWindow(window, named: "event-form")
    }

    @MainActor
    func testCommandPaletteSnapshot() {
        let window = launchDemoWindow()
        window.typeKey("k", modifierFlags: [.command])
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-command-palette"].waitForExistence(timeout: 8))
        NativeImageSnapshotSupport.captureWindow(window, named: "command-palette")
    }

    @MainActor
    func testShortcutsLegendSnapshot() {
        let window = launchDemoWindow()
        window.typeKey("/", modifierFlags: [.shift])
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-shortcuts-legend"].waitForExistence(timeout: 8))
        NativeImageSnapshotSupport.captureWindow(window, named: "shortcuts-legend")
    }

    @MainActor
    private func launchDemoWindow() -> XCUIElement {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        return window
    }
}
