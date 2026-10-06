import AppKit
import XCTest

final class NativeLaunchTests: XCTestCase {
    /// AppKit cards report 0×0 frames in CI. Normalized center clicks the origin (often the content edge),
    /// which misses the card and only shows the grid scroll hint. Nudge into the timed column interior.
    @MainActor
    private func clickGridEvent(_ element: XCUIElement) {
        element.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: 90, dy: 28))
            .click()
    }

    @MainActor
    private func waitForFocusedGridEvent(title: String, in window: XCUIElement, timeout: TimeInterval) {
        let probe = window.descendants(matching: .any)["compass-grid-event-focused"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if probe.exists {
                if probe.label == title { return }
                if probe.value as? String == title { return }
            }
            if window.value as? String == title {
                return
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        let probeLabel = probe.exists ? probe.label : "(missing)"
        let probeValue = probe.exists ? String(describing: probe.value) : "(missing)"
        let windowValue = String(describing: window.value)
        XCTFail(
            "Expected focused grid event \"\(title)\"; "
                + "probe label=\(probeLabel), probe value=\(probeValue), window value=\(windowValue)")
    }

    @MainActor
    func testLaunchShowsTheMainWindow() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.windows["Compass"].waitForExistence(timeout: 15))
    }

    @MainActor
    func testFreshLaunchShowsWelcomeModal() {
        let app = XCUIApplication()
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-welcome-modal"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testNativeLaunchShowsHeaderAndSidebar() {
        let app = XCUIApplication()
        // Demo fixture skips the welcome modal; its modal trait hides header/sidebar from XCUITest.
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-header"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-sidebar"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testLifeViewSwitchAndBack() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.staticTexts["Morning standup"].waitForExistence(timeout: 10),
            "Expected demo fixture week grid before switching to Life view")

        window.typeKey("l", modifierFlags: [])
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-native-life-grid"].waitForExistence(timeout: 5))
        XCTAssertTrue(window.staticTexts["Life"].waitForExistence(timeout: 3))

        window.typeKey("w", modifierFlags: [])
        XCTAssertTrue(
            window.staticTexts["Morning standup"].waitForExistence(timeout: 10),
            "Expected demo fixture week grid after leaving Life view")
        XCTAssertFalse(
            window.descendants(matching: .any)["compass-native-life-grid"].exists)
    }

    @MainActor
    func testFixtureLaunchShowsDemoWeekEvents() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.buttons["Morning standup"].waitForExistence(timeout: 10),
            "Expected demo fixture event title on the native grid")
    }

    @MainActor
    func testArrowMovesFocusBetweenTwoFixtureEvents() {
        let app = XCUIApplication()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
        ]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        waitForFocusedGridEvent(title: "Morning standup", in: window, timeout: 10)

        window.typeKey(.downArrow, modifierFlags: [])
        waitForFocusedGridEvent(title: "Try Compass", in: window, timeout: 10)
    }

    @MainActor
    func testLaunchDeepLinkNavigatesToDayView() {
        let app = XCUIApplication()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_LAUNCH_DEEP_LINK", "compass://day/2026-10-15",
        ]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))

        let pathReady = NSPredicate(format: "label == %@", "/day/2026-10-15")
        let pathExpectation = expectation(
            for: pathReady,
            evaluatedWith: window,
            handler: nil)
        wait(for: [pathExpectation], timeout: 45)
    }

    @MainActor
    func testKeyboardCreatesTimedDraftOnGrid() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))

        window.typeKey(.downArrow, modifierFlags: [.shift])
        XCTAssertTrue(
            window.buttons["Untitled event"].waitForExistence(timeout: 5),
            "Expected keyboard-placed draft card on the grid")

        window.typeKey(.enter, modifierFlags: [])
        XCTAssertTrue(
            window.buttons["Untitled event"].waitForExistence(timeout: 10),
            "Expected saved event card after Enter")
    }

    @MainActor
    func testCommandPaletteGoToToday() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))

        window.typeKey("k", modifierFlags: [.command])
        let palette = window.descendants(matching: .any)["compass-native-command-palette"]
        XCTAssertTrue(palette.waitForExistence(timeout: 5))

        let todayItem = window.descendants(matching: .any)["compass-native-palette-item-today"]
        XCTAssertTrue(todayItem.waitForExistence(timeout: 5))
        todayItem.click()

        XCTAssertFalse(palette.waitForExistence(timeout: 2))
        XCTAssertTrue(
            window.staticTexts["Morning standup"].waitForExistence(timeout: 10),
            "Expected demo week grid after Go to Today")
    }

    @MainActor
    func testHideAndUnhideFixtureEvent() {
        let app = XCUIApplication()
        app.launchArguments += [
            "-COMPASS_NATIVE_UI", "YES",
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
        ]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        let standup = window.buttons["compass-grid-event-demo-morning-standup"]
        XCTAssertTrue(standup.waitForExistence(timeout: 10))

        window.typeKey("x", modifierFlags: [])
        let hiddenReady = NSPredicate(format: "value == %@", "hidden")
        let hiddenExpectation = expectation(for: hiddenReady, evaluatedWith: standup, handler: nil)
        wait(for: [hiddenExpectation], timeout: 8)

        window.typeKey("x", modifierFlags: [])
        let visibleReady = NSPredicate(format: "value == %@", "visible")
        let visibleExpectation = expectation(for: visibleReady, evaluatedWith: standup, handler: nil)
        wait(for: [visibleExpectation], timeout: 8)
    }

    @MainActor
    func testEventFormEditsTitleAndSaves() {
        let app = XCUIApplication()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
            "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
        ]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        waitForFocusedGridEvent(title: "Morning standup", in: window, timeout: 10)

        let titleField = window.descendants(matching: .any)["compass-event-form-title"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 8))
        window.typeKey("a", modifierFlags: [.command])
        window.typeText("Updated standup")

        window.typeKey(.enter, modifierFlags: [.command])
        XCTAssertTrue(
            window.buttons["Updated standup"].waitForExistence(timeout: 10),
            "Expected grid card title to update after saving the form")
    }

    @MainActor
    func testUndoCreateRemovesKeyboardPlacedEvent() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_NATIVE_UI", "YES", "-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))

        window.typeKey(.downArrow, modifierFlags: [.shift])
        let draft = window.buttons["Untitled event"]
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        window.typeKey(.enter, modifierFlags: [])
        XCTAssertTrue(draft.waitForExistence(timeout: 10))

        window.typeKey("z", modifierFlags: [.command])
        XCTAssertFalse(draft.waitForExistence(timeout: 8))
    }

    @MainActor
    /// Opens the native quick-add panel from the Debug menu and saves a fixture event.
    func testQuickAddPanelCreatesFixtureEvent() {
        let app = XCUIApplication()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_STICKY_QUICK_ADD_PANEL",
        ]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))

        let debugMenu = app.menuBars.menuBarItems["Debug"]
        XCTAssertTrue(debugMenu.waitForExistence(timeout: 5))
        debugMenu.click()
        app.menuItems["Open Quick Add Panel"].click()

        let panel = app.windows.matching(
            NSPredicate(format: "identifier == %@", "compass-native-quick-add-window")
        ).firstMatch
        XCTAssertTrue(panel.waitForExistence(timeout: 5))
        let field = panel.textFields.matching(
            NSPredicate(format: "identifier == %@", "compass-native-quick-add-field")
        ).firstMatch
        XCTAssertTrue(
            field.waitForExistence(timeout: 10),
            "Expected native quick-add text field after opening the panel")
        field.click()
        // Paste the title so macOS XCUITest does not drop keystrokes from typeText.
        let title = "Quick add fixture"
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(title, forType: .string)
        field.typeKey("v", modifierFlags: [.command])

        panel.typeKey(.enter, modifierFlags: [])
        waitForFocusedGridEvent(title: "Quick add fixture", in: window, timeout: 15)
        XCTAssertTrue(
            window.buttons["Quick add fixture"].waitForExistence(timeout: 5),
            "Expected saved quick-add event card on the native grid")
    }

    @MainActor
    func testKeyboardDeletesFocusedFixtureEvent() {
        let app = XCUIApplication()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
        ]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        waitForFocusedGridEvent(title: "Morning standup", in: window, timeout: 10)

        let standup = window.buttons["compass-grid-event-demo-morning-standup"]
        XCTAssertTrue(standup.waitForExistence(timeout: 5))
        window.typeKey(.delete, modifierFlags: [])
        XCTAssertFalse(standup.waitForExistence(timeout: 8))
    }

    @MainActor
    func testRecurringDeleteShowsScopePromptAndAcceptsFollowing() {
        let app = XCUIApplication()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_APPEND_DEMO_OCCURRENCE",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-weekly-occurrence",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
        ]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        waitForFocusedGridEvent(title: "Weekly sync", in: window, timeout: 10)

        let occurrence = window.buttons["compass-grid-event-demo-weekly-occurrence"]
        XCTAssertTrue(occurrence.waitForExistence(timeout: 5))
        window.typeKey(.delete, modifierFlags: [])
        XCTAssertFalse(occurrence.waitForExistence(timeout: 8))

        let toast = window.descendants(matching: .any)["compass-native-status-toast"]
        XCTAssertTrue(toast.waitForExistence(timeout: 8))
        window.typeKey("1", modifierFlags: [])
        XCTAssertFalse(toast.waitForExistence(timeout: 8))
    }

    @MainActor
    func testQuestionMarkTogglesShortcutsLegend() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        let legend = window.descendants(matching: .any)["compass-native-shortcuts-legend"]

        window.typeKey("/", modifierFlags: [.shift])
        XCTAssertTrue(legend.waitForExistence(timeout: 5))

        window.typeKey(.escape, modifierFlags: [])
        XCTAssertFalse(legend.waitForExistence(timeout: 5))
    }

    @MainActor
    func testCommandPaletteStartsBlockPartyPractice() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))

        window.typeKey("k", modifierFlags: [.command])
        let practiceItem = window.descendants(matching: .any)["compass-native-palette-item-practice-shortcuts"]
        XCTAssertTrue(practiceItem.waitForExistence(timeout: 8))
        practiceItem.click()

        let overlay = window.descendants(matching: .any)["block-party-overlay"]
        XCTAssertTrue(overlay.waitForExistence(timeout: 8))

        let start = window.buttons["Start practicing"]
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.click()

        XCTAssertTrue(
            window.descendants(matching: .any)["block-party-practice-grid"].waitForExistence(timeout: 8))
    }

    @MainActor
    func testEventClickShowsPointerHintWithoutOpening() {
        let app = XCUIApplication()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()

        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        let standup = window.buttons["compass-grid-event-demo-morning-standup"]
        XCTAssertTrue(standup.waitForExistence(timeout: 10))
        clickGridEvent(standup)

        let hint = window.descendants(matching: .any)["compass-pointer-hint"]
        XCTAssertTrue(hint.waitForExistence(timeout: 5))
        XCTAssertFalse(window.descendants(matching: .any)["compass-event-form"].exists)
    }
}
