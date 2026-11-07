import XCTest
@testable import CompassData

@MainActor
final class CommandPaletteStatusAnnouncementDeliveryTests: XCTestCase {
    func testProductionLaunchEmitsAnnouncementWithoutMirror() {
        let delivery = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: "Showing week of Tuesday, December 15, 2026",
            attachesAccessibilityProbes: false
        )
        XCTAssertEqual(
            delivery.announcementRequestedPayload,
            "Showing week of Tuesday, December 15, 2026")
        XCTAssertNil(delivery.mirrorText)
        XCTAssertFalse(delivery.clearProbeMirror)
    }

    func testUITestLaunchMirrorsAndEmitsAnnouncement() {
        let delivery = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: "Showing week of Tuesday, December 15, 2026",
            attachesAccessibilityProbes: true
        )
        XCTAssertEqual(
            delivery.announcementRequestedPayload,
            "Showing week of Tuesday, December 15, 2026")
        XCTAssertEqual(
            delivery.mirrorText,
            "Showing week of Tuesday, December 15, 2026")
        XCTAssertFalse(delivery.clearProbeMirror)
    }

    func testRepeatSameAnnouncementStillEmitsProductionPayload() {
        let text = "Showing week of Thursday, October 29, 2026"
        let first = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: text,
            attachesAccessibilityProbes: false)
        let second = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: text,
            attachesAccessibilityProbes: false)
        XCTAssertEqual(first.announcementRequestedPayload, text)
        XCTAssertEqual(second.announcementRequestedPayload, text)
    }

    func testClearAnnouncementClearsMirrorAndSkipsSpokenPayload() {
        let delivery = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: "",
            attachesAccessibilityProbes: true
        )
        XCTAssertNil(delivery.announcementRequestedPayload)
        XCTAssertNil(delivery.mirrorText)
        XCTAssertTrue(delivery.clearProbeMirror)
    }

    func testConsumeAnnouncementPathUsesClearDelivery() {
        let store = CommandPaletteStore()
        var received: [String] = []
        store.onAnnouncementChanged = { received.append($0) }
        store.announce("Showing week of Tuesday, December 15, 2026")
        store.consumeAnnouncement()
        XCTAssertEqual(
            received,
            ["Showing week of Tuesday, December 15, 2026", ""])
        let clear = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: received.last,
            attachesAccessibilityProbes: false
        )
        XCTAssertTrue(clear.clearProbeMirror)
        XCTAssertNil(clear.announcementRequestedPayload)
    }
}
