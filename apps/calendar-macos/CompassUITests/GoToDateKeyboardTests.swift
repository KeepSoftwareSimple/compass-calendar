import XCTest

final class GoToDateKeyboardTests: XCTestCase {
    @MainActor
    func testISODateNavigatesFromBareG() {
        assertGoToDate(
            query: "2026-12-15",
            label: "Go to Tue, Dec 15, 2026",
            date: "2026-12-15",
            announcement: "Showing week of Tuesday, December 15, 2026"
        )
    }

    @MainActor
    func testSlashSeparatedDateNavigatesFromBareG() {
        assertGoToDate(
            query: "2026/10/29",
            label: "Go to Thu, Oct 29, 2026",
            date: "2026-10-29",
            announcement: "Showing week of Thursday, October 29, 2026"
        )
    }

    @MainActor
    func testMonthFirstDateUsesDemoReferenceYear() {
        assertGoToDate(
            query: "10/29",
            label: "Go to Thu, Oct 29, 2026",
            date: "2026-10-29",
            announcement: "Showing week of Thursday, October 29, 2026"
        )
    }

    @MainActor
    private func assertGoToDate(
        query: String,
        label: String,
        date: String,
        announcement: String
    ) {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += ["-COMPASS_FIXTURE", "demo"]
        app.launch()
        defer { app.terminate() }
        let window = app.windows["Compass"]
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(window.staticTexts["Morning standup"].waitForExistence(timeout: 8))
        window.typeKey("g", modifierFlags: [])
        let search = window.textFields["compass-native-command-palette-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 8))
        search.typeText(query)
        let option = window.buttons["compass-native-palette-item-go-to-date"]
        XCTAssertTrue(option.waitForExistence(timeout: 5))
        XCTAssertEqual(option.label, label)
        XCTAssertEqual(option.value as? String, "Selected")
        search.typeKey(.return, modifierFlags: [])
        let palette = window.descendants(matching: .any)["compass-native-command-palette"]
        XCTAssertTrue(palette.waitForNonExistence(timeout: 5))
        XCTAssertFalse(search.exists)
        let day = window.descendants(matching: .any)["compass-grid-column-\(date)"]
        XCTAssertTrue(day.waitForExistence(timeout: 8))
        let status = window.staticTexts["compass-native-command-palette-status-announcement"]
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertEqual(status.label, announcement)
        XCTAssertTrue(day.isHittable, "Chosen day must be visible in the calendar")
        XCTAssertGreaterThan(day.frame.width, 0)
        XCTAssertGreaterThan(day.frame.height, 0)
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Go to date \(query) shows \(date)"
        evidence.lifetime = .keepAlways
        add(evidence)
    }
}
