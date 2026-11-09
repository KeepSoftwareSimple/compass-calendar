import XCTest
@testable import CompassData

@MainActor
final class CommandPaletteStatusAnnouncementDeliveryTests: XCTestCase {
    func testProductionLaunchEmitsAnnouncementWithoutMirror() {
        let delivery = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: "Showing week of Tuesday, December 15, 2026",
            attachesAccessibilityProbes: false
        )
        guard case .speak(let payload, let mirror) = delivery else {
            return XCTFail("expected speak")
        }
        XCTAssertEqual(payload, "Showing week of Tuesday, December 15, 2026")
        XCTAssertNil(mirror)
    }

    func testUITestLaunchMirrorsAndEmitsAnnouncement() {
        let delivery = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: "Showing week of Tuesday, December 15, 2026",
            attachesAccessibilityProbes: true
        )
        guard case .speak(let payload, let mirror) = delivery else {
            return XCTFail("expected speak")
        }
        XCTAssertEqual(payload, "Showing week of Tuesday, December 15, 2026")
        XCTAssertEqual(mirror, "Showing week of Tuesday, December 15, 2026")
    }

    func testRepeatSameAnnouncementStillEmitsProductionPayload() {
        let text = "Showing week of Thursday, October 29, 2026"
        let first = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: text,
            attachesAccessibilityProbes: false)
        let second = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: text,
            attachesAccessibilityProbes: false)
        guard case .speak(let firstPayload, _) = first,
              case .speak(let secondPayload, _) = second
        else {
            return XCTFail("expected speak")
        }
        XCTAssertEqual(firstPayload, text)
        XCTAssertEqual(secondPayload, text)
    }

    func testClearAnnouncementSkipsSpokenPayload() {
        let delivery = CommandPaletteStatusAnnouncementPlanner.deliver(
            announcement: "",
            attachesAccessibilityProbes: true
        )
        guard case .clear = delivery else {
            return XCTFail("expected clear")
        }
    }

    func testAnnounceForwardsEveryCallIncludingRepeats() {
        let store = CommandPaletteStore()
        var received: [String] = []
        store.onAnnouncementChanged = { received.append($0) }
        store.announce("Showing week of Tuesday, December 15, 2026")
        store.announce("Showing week of Tuesday, December 15, 2026")
        XCTAssertEqual(
            received,
            [
                "Showing week of Tuesday, December 15, 2026",
                "Showing week of Tuesday, December 15, 2026",
            ])
    }
}
