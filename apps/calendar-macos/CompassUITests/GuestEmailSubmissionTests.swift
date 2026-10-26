import XCTest

final class GuestEmailSubmissionTests: XCTestCase {
    @MainActor
    func testReturnAddsGuestWithoutSavingEvent() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo", "-COMPASS_APP_URL", "https://compass.invalid",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK",
        ]
        app.launch()
        let window = app.windows["Compass"]
        XCTAssertTrue(window.buttons["Morning standup"].waitForExistence(timeout: 8))
        window.typeKey("c", modifierFlags: [])
        let form = window.descendants(matching: .any)["compass-event-form"].firstMatch
        XCTAssertTrue(form.waitForExistence(timeout: 8))
        let title = form.descendants(matching: .any)["compass-event-form-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        title.click()
        title.typeKey("a", modifierFlags: [.command])
        title.typeText("Guest input regression")
        let calendar = form.descendants(matching: .any)["compass-event-form-calendar"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 8))
        for _ in 0..<6 where !calendar.isHittable {
            window.typeKey(.pageDown, modifierFlags: [])
        }
        calendar.click()
        app.menuItems["Compass (primary)"].click()
        window.typeKey("8", modifierFlags: [.command])
        let guest = form.descendants(matching: .any)["Add guest email"]
        XCTAssertTrue(guest.waitForExistence(timeout: 8))
        guest.click()
        guest.typeText("guest@example.invalid")
        guest.typeKey(.return, modifierFlags: [])
        XCTAssertTrue(form.staticTexts["guest@example.invalid"].waitForExistence(timeout: 8))
        XCTAssertTrue(form.buttons["compass-event-form-save"].exists)
        XCTAssertFalse(window.staticTexts["Send invitation emails?"].exists)
        guest.typeKey(.return, modifierFlags: [])
        XCTAssertTrue(form.buttons["compass-event-form-save"].exists)
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Guest added without saving the form"
        evidence.lifetime = .keepAlways
        add(evidence)
        title.click()
        title.typeKey(.return, modifierFlags: [])
        let invitations = window.staticTexts["Send invitation emails?"]
        XCTAssertTrue(form.buttons["compass-event-form-save"].exists)
        XCTAssertFalse(invitations.exists)
        title.typeKey(.return, modifierFlags: [.command])
        XCTAssertTrue(invitations.waitForExistence(timeout: 8))
        window.typeKey(.escape, modifierFlags: [])
        XCTAssertTrue(invitations.waitForNonExistence(timeout: 8))
        guest.click()
        guest.typeKey(.return, modifierFlags: [.command])
        XCTAssertTrue(invitations.waitForExistence(timeout: 8))
    }
}
