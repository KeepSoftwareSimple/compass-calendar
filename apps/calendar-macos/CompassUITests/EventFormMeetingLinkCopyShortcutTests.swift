import AppKit
import XCTest

final class EventFormMeetingLinkCopyShortcutTests: XCTestCase {
    @MainActor
    func testMeetingLinkRowShowsKeycapsAndShortcutCopiesURL() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        defer { pasteboard.clearContents() }

        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
        ]
        app.launch()
        let window = app.windows["Compass"]
        let form = window.descendants(matching: .any)["compass-event-form"]
        XCTAssertTrue(form.waitForExistence(timeout: 12))

        window.typeKey("=", modifierFlags: [.command])
        let conference = form.descendants(matching: .any)["compass-event-form-conference"]
        for _ in 0 ..< 4 where !conference.waitForExistence(timeout: 1) {
            form.swipeUp()
        }
        XCTAssertTrue(conference.waitForExistence(timeout: 4))
        let namedConference = form.links["Google Meet"]
        XCTAssertTrue(namedConference.exists, "The meeting URL must expose its visible provider label as a link")
        let viewport = form.scrollViews.firstMatch.frame
        XCTAssertGreaterThan(namedConference.frame.height, 0)
        XCTAssertTrue(viewport.contains(namedConference.frame), "The meeting link must remain inside the form viewport")

        let copyByIdentifier = form.buttons["compass-event-form-meeting-link-copy"]
        let copyByLabel = form.buttons["copy meeting link"]
        XCTAssertTrue(
            copyByIdentifier.waitForExistence(timeout: 4) || copyByLabel.waitForExistence(timeout: 1))

        XCTAssertTrue(copyByLabel.exists)
        XCTAssertGreaterThan(copyByLabel.frame.height, 0)
        XCTAssertTrue(viewport.contains(copyByLabel.frame), "The copy action must remain visible beside the link")
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Meeting link label, copy action and visible shortcut hints"
        evidence.lifetime = .keepAlways
        add(evidence)

        let title = form.descendants(matching: .any)["compass-event-form-title"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 4))
        title.click()
        pasteboard.clearContents()
        window.typeKey("l", modifierFlags: [.command, .shift])
        XCTAssertTrue(window.staticTexts["Link copied"].waitForExistence(timeout: 8))
        XCTAssertEqual(pasteboard.string(forType: .string), "https://meet.google.com/abc-defg-hij")
    }
}
