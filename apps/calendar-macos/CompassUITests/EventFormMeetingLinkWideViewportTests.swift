import XCTest

/// Web `event-form-meeting-link-keycaps` post-resize viewport (1440×960). Runs on the Intel display job.
final class EventFormMeetingLinkWideViewportTests: XCTestCase {
    @MainActor
    func testMeetingLinkAndCopyKeycapsStayInViewportAtWideWindow() {
        continueAfterFailure = false
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_MEETING_LINK_WIDE_VIEWPORT",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
        ]
        app.launch()
        let window = app.windows["Compass"]
        let rawValue = MeetingLinkViewportXCUITestSupport.waitForGeometryPayload(on: window, timeout: 8)
        let titleProbe = window.descendants(matching: .any)["compass-event-form-title"]
        XCTAssertTrue(titleProbe.waitForExistence(timeout: 12))
        let form = window.descendants(matching: .any)["compass-event-form"]
        XCTAssertTrue(form.exists)
        guard let reading = MeetingLinkViewportXCUITestSupport.parseGeometryProbe(rawValue) else {
            XCTFail("Unparseable geometry probe: \(rawValue)")
            return
        }
        XCTAssertEqual(reading.targetWidth, 1440, "Nominal web viewport width")
        XCTAssertEqual(reading.targetHeight, 960, "Nominal web viewport height")
        XCTAssertTrue(
            reading.fitsScreen,
            "NSScreen visible \(reading.screenWidth)×\(reading.screenHeight) must host 1440×960 (achieved \(reading.achievedWidth)×\(reading.achievedHeight)).")
        XCTAssertTrue(
            reading.achievedTarget,
            "Content size must match 1440×960 within ±2 pt (got \(reading.achievedWidth)×\(reading.achievedHeight) on visible \(reading.screenWidth)×\(reading.screenHeight)).")
        XCTAssertTrue(reading.onScreen, "Main window must sit fully inside the visible screen frame (±2 pt).")

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

        let scrollViewport = form.scrollViews.firstMatch.frame
        for (label, element) in [
            ("Meeting link", namedConference),
            ("Copy control", copyByLabel),
            ("Shortcut keycaps", keycaps),
            ("L keycap", lKeycap),
        ] {
            MeetingLinkViewportXCUITestSupport.assertFullyVisibleInScrollViewport(
                element, viewport: scrollViewport, label: label)
            MeetingLinkViewportXCUITestSupport.assertFullyVisibleInWindow(element, window: window, label: label)
        }

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

        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Meeting link and copy keycaps at 1440×960"
        evidence.lifetime = .keepAlways
        add(evidence)
    }
}
