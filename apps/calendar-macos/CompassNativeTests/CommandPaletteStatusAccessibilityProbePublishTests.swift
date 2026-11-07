import AppKit
import CompassData
import XCTest

/// Exercises shipping `CommandPaletteStatusAccessibilityProbe.publish`, not the planner alone.
@MainActor
final class CommandPaletteStatusAccessibilityProbePublishTests: XCTestCase {
    private var window: NSWindow!

    override func setUp() async throws {
        try await super.setUp()
        XCTAssertFalse(
            UITestLaunchPolicy.attachesAccessibilityProbes(
                arguments: ProcessInfo.processInfo.arguments
            ),
            "These tests require a production launch profile without -COMPASS_UI_TEST"
        )
        CommandPaletteStatusAccessibilityProbe.resetAnnouncementPostInterceptForTesting()
        CommandPaletteStatusAccessibilityProbe.interceptAnnouncementPostForTesting = true
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 300),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        window.contentView = NSView(frame: window.contentRect(forFrameRect: window.frame))
    }

    override func tearDown() async throws {
        CommandPaletteStatusAccessibilityProbe.resetAnnouncementPostInterceptForTesting()
        window = nil
        try await super.tearDown()
    }

    func testProductionPublishPostsOnHostWindowWithoutAttachedProbe() {
        let announcement = "Showing week of Tuesday, December 15, 2026"
        CommandPaletteStatusAccessibilityProbe.publish(announcement: announcement, hostWindow: window)

        let posts = CommandPaletteStatusAccessibilityProbe.interceptedAnnouncementPostsForTesting
        XCTAssertEqual(posts.count, 1)
        XCTAssertEqual(posts[0].hostWindowID, ObjectIdentifier(window))
        XCTAssertEqual(posts[0].notification, .announcementRequested)
        XCTAssertEqual(posts[0].announcement, announcement)

        let host = window.contentView!
        XCTAssertFalse(
            host.subviews.contains { $0 is CommandPaletteStatusAccessibilityProbeView },
            "Production publish must not require an attached mirror probe"
        )
    }

    func testRepeatPublishEmitsAnnouncementRequestedTwice() {
        let announcement = "Showing week of Thursday, October 29, 2026"
        CommandPaletteStatusAccessibilityProbe.publish(announcement: announcement, hostWindow: window)
        CommandPaletteStatusAccessibilityProbe.publish(announcement: announcement, hostWindow: window)

        let posts = CommandPaletteStatusAccessibilityProbe.interceptedAnnouncementPostsForTesting
        XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(posts[0].announcement, announcement)
        XCTAssertEqual(posts[1].announcement, announcement)
        XCTAssertEqual(posts[0].hostWindowID, ObjectIdentifier(window))
        XCTAssertEqual(posts[1].hostWindowID, ObjectIdentifier(window))
    }

    func testClearPublishDoesNotEmitSpokenPayload() {
        CommandPaletteStatusAccessibilityProbe.publish(
            announcement: "Showing week of Tuesday, December 15, 2026",
            hostWindow: window
        )
        CommandPaletteStatusAccessibilityProbe.resetAnnouncementPostInterceptForTesting()
        CommandPaletteStatusAccessibilityProbe.interceptAnnouncementPostForTesting = true

        CommandPaletteStatusAccessibilityProbe.publish(announcement: nil, hostWindow: window)

        XCTAssertTrue(CommandPaletteStatusAccessibilityProbe.interceptedAnnouncementPostsForTesting.isEmpty)
    }
}
