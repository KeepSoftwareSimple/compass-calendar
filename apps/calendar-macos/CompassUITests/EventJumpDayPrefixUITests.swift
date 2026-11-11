import XCTest

final class EventJumpDayPrefixUITests: XCTestCase {
    /// Types a chip label, including ⇧w… hints that require Shift+W on macOS.
    private func typeEventJumpChipLabel(_ label: String, in window: XCUIElement) {
        if label.hasPrefix("⇧") {
            let remainder = String(label.dropFirst())
            guard let first = remainder.first else {
                XCTFail("Expected characters after ⇧ in \(label)")
                return
            }
            window.typeKey(String(first), modifierFlags: .shift)
            for character in remainder.dropFirst() {
                window.typeKey(String(character), modifierFlags: [])
            }
            return
        }
        XCTAssertEqual(label, label.lowercased())
        for character in label {
            window.typeKey(String(character), modifierFlags: [])
        }
    }
    @MainActor
    func testLowercaseDayPrefixChipFocusesEvent() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
            "-COMPASS_UI_TEST_ACTIVATE_EVENT_JUMP",
        ]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.staticTexts["Morning standup"].waitForExistence(timeout: 10),
            "Expected demo fixture week grid before event jump")
        window.click()
        let chipLabels = window.staticTexts.matching(identifier: "compass-event-jump-chip")
        let firstChip = chipLabels.element(boundBy: 0)
        XCTAssertTrue(
            firstChip.waitForExistence(timeout: 15),
            "Expected lowercase event jump chip labels after pressing f")
        XCTAssertGreaterThan(chipLabels.count, 0)
        let label = firstChip.label
        XCTAssertFalse(label.isEmpty)
        typeEventJumpChipLabel(label, in: window)
        let probe = window.descendants(matching: .any)["compass-grid-event-focused"]
        XCTAssertTrue(probe.waitForExistence(timeout: 8))
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Day-prefix event jump chips"
        evidence.lifetime = .keepAlways
        add(evidence)
    }

    /// Demo `referenceNow` (2026-06-10) is a Wednesday; timed events that day are
    /// hinted `w1` (standup), `w2`, `w3` (Exercise) in stable start-time order.
    @MainActor
    func testShiftWednesdayEventJumpChipW1FocusesStandup() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
            "-COMPASS_UI_TEST_ACTIVATE_EVENT_JUMP",
        ]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        let wednesdayColumn = window.descendants(matching: .any)["compass-grid-column-2026-06-10"]
        XCTAssertTrue(
            wednesdayColumn.waitForExistence(timeout: 15),
            "Expected pinned demo week to include Wednesday 2026-06-10")
        XCTAssertTrue(
            window.staticTexts["Morning standup"].waitForExistence(timeout: 10),
            "Expected Wednesday Morning standup on demo grid")
        window.click()
        let w1Chip = window.staticTexts.matching(
            NSPredicate(format: "identifier == %@ AND label == %@", "compass-event-jump-chip", "⇧w1")
        ).firstMatch
        XCTAssertTrue(
            w1Chip.waitForExistence(timeout: 15),
            "Expected ⇧w1 chip for first Wednesday timed event")
        typeEventJumpChipLabel("⇧w1", in: window)
        let probe = window.descendants(matching: .any)["compass-grid-event-focused"]
        XCTAssertTrue(probe.waitForExistence(timeout: 8))
        XCTAssertTrue(
            window.buttons["Morning standup"].waitForExistence(timeout: 4),
            "Expected Shift+W1 jump to focus Morning standup")
    }

    @MainActor
    func testShiftWSelectsWednesdayWhileJumpModeActive() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
            "-COMPASS_UI_TEST_ACTIVATE_EVENT_JUMP",
        ]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-grid-column-2026-06-10"].waitForExistence(timeout: 15))
        window.click()
        window.typeKey("w", modifierFlags: .shift)
        let status = window.descendants(matching: .any)["compass-native-event-jump-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 6))
        let statusText = (status.value as? String) ?? status.label
        XCTAssertTrue(
            statusText.localizedCaseInsensitiveContains("Wednesday"),
            "Expected Shift+W to select Wednesday, got: \(statusText)")
    }

    @MainActor
    func testShiftWednesdayEventJumpChipW3FocusesExercise() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
            "-COMPASS_UI_TEST_ACTIVATE_EVENT_JUMP",
        ]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(
            window.descendants(matching: .any)["compass-grid-column-2026-06-10"].waitForExistence(timeout: 15))
        XCTAssertTrue(window.buttons["Exercise"].waitForExistence(timeout: 10))
        window.click()
        let w3Chip = window.staticTexts.matching(
            NSPredicate(format: "identifier == %@ AND label == %@", "compass-event-jump-chip", "⇧w3")
        ).firstMatch
        XCTAssertTrue(
            w3Chip.waitForExistence(timeout: 15),
            "Expected ⇧w3 chip for Exercise on demo Wednesday")
        typeEventJumpChipLabel("⇧w3", in: window)
        XCTAssertTrue(window.descendants(matching: .any)["compass-grid-event-focused"].waitForExistence(timeout: 8))
        XCTAssertTrue(
            window.buttons["Exercise"].waitForExistence(timeout: 4),
            "Expected Shift+W3 jump to focus Exercise")
    }
}
