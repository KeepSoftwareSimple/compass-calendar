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

        let keycaps = form.descendants(matching: .any)["compass-event-form-meeting-link-copy-keycaps"]
        XCTAssertTrue(keycaps.waitForExistence(timeout: 4), "Mod+Shift+L hint chips must be visible to UI tests")
        XCTAssertGreaterThan(keycaps.frame.height, 0)
        XCTAssertTrue(viewport.contains(keycaps.frame), "Shortcut hint chips must stay inside the form viewport")
        let lKeycap = form.descendants(matching: .any)["compass-event-form-meeting-link-keycap-l"]
        XCTAssertTrue(lKeycap.exists, "The taught L keycap must mirror web l-icon")
        XCTAssertGreaterThan(lKeycap.frame.height, 0)
        XCTAssertTrue(viewport.contains(lKeycap.frame))
        MeetingLinkViewportXCUITestSupport.assertVisibleInWindow(namedConference, window: window, label: "Meeting link")
        MeetingLinkViewportXCUITestSupport.assertVisibleInWindow(copyByLabel, window: window, label: "Copy control")
        MeetingLinkViewportXCUITestSupport.assertVisibleInWindow(keycaps, window: window, label: "Shortcut keycaps")
        MeetingLinkViewportXCUITestSupport.assertVisibleInWindow(lKeycap, window: window, label: "L keycap")

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

    @MainActor
    func testMeetingLinkAndCopyKeycapsStayInViewportAtWideWindow() {
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_MEETING_LINK_WIDE_VIEWPORT",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
        ]
        app.launch()
        let window = app.windows["Compass"]
        let form = window.descendants(matching: .any)["compass-event-form"]
        XCTAssertTrue(form.waitForExistence(timeout: 12))

        let geometry = window.descendants(matching: .any)["compass-native-main-window-geometry"]
        XCTAssertTrue(geometry.waitForExistence(timeout: 8))
        let rawValue = geometry.value as? String ?? ""
        guard let reading = MeetingLinkViewportXCUITestSupport.parseGeometryProbe(rawValue) else {
            XCTFail("Unparseable geometry probe: \(rawValue)")
            return
        }
        XCTAssertEqual(reading.targetWidth, 1440)
        XCTAssertEqual(reading.targetHeight, 960)
        XCTAssertTrue(
            reading.fitsScreen,
            "Runner screen \(reading.screenWidth)×\(reading.screenHeight) cannot host 1440×960; wide viewport parity is not asserted on this host.")
        XCTAssertTrue(
            reading.achievedTarget,
            "MeetingLinkWideViewportPolicy must achieve 1440×960 content (got \(reading.achievedWidth)×\(reading.achievedHeight)).")
        XCTAssertTrue(reading.onScreen, "Main window must sit fully inside the visible screen frame.")

        window.typeKey("=", modifierFlags: [.command])
        let conference = form.descendants(matching: .any)["compass-event-form-conference"]
        for _ in 0 ..< 4 where !conference.waitForExistence(timeout: 1) {
            form.swipeUp()
        }
        XCTAssertTrue(conference.waitForExistence(timeout: 4))
        let namedConference = form.links["Google Meet"]
        XCTAssertTrue(namedConference.waitForExistence(timeout: 4))
        XCTAssertGreaterThan(namedConference.frame.width, 0)
        XCTAssertGreaterThan(namedConference.frame.height, 0)
        let copyByLabel = form.buttons["copy meeting link"]
        XCTAssertTrue(copyByLabel.waitForExistence(timeout: 4))
        let keycaps = form.descendants(matching: .any)["compass-event-form-meeting-link-copy-keycaps"]
        XCTAssertTrue(keycaps.waitForExistence(timeout: 4))
        let lKeycap = form.descendants(matching: .any)["compass-event-form-meeting-link-keycap-l"]
        XCTAssertTrue(lKeycap.waitForExistence(timeout: 4))

        let viewport = form.scrollViews.firstMatch.frame
        XCTAssertTrue(viewport.contains(namedConference.frame))
        XCTAssertTrue(viewport.contains(keycaps.frame))
        XCTAssertTrue(viewport.contains(lKeycap.frame))

        MeetingLinkViewportXCUITestSupport.attachGeometryEvidence(
            self,
            reading: reading,
            window: window,
            elements: [
                ("link", namedConference),
                ("copy", copyByLabel),
                ("keycaps", keycaps),
                ("l-keycap", lKeycap),
            ])
        MeetingLinkViewportXCUITestSupport.assertVisibleInWindow(namedConference, window: window, label: "Meeting link")
        MeetingLinkViewportXCUITestSupport.assertVisibleInWindow(copyByLabel, window: window, label: "Copy control")
        MeetingLinkViewportXCUITestSupport.assertVisibleInWindow(keycaps, window: window, label: "Shortcut keycaps")
        MeetingLinkViewportXCUITestSupport.assertVisibleInWindow(lKeycap, window: window, label: "L keycap")

        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Meeting link and copy keycaps at 1440×960"
        evidence.lifetime = .keepAlways
        add(evidence)
    }
}
