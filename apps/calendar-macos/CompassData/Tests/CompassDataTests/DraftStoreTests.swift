import CompassData
import CompassKit
import XCTest

@MainActor
final class DraftStoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EffectiveTimeZone.identifier = "UTC"
    }

    func testNudgeParityThroughStore() throws {
        let store = DraftStore()
        let start = try parseISO("2026-01-01T10:00:00.000Z")
        let end = try parseISO("2026-01-01T11:00:00.000Z")
        store.startGridDraft(
            activity: .keyboardPlace,
            schedule: DraftSchedule(start: start, end: end, kind: .timed)
        )

        let moved = store.nudgeByKeyboard(key: "ArrowRight")
        XCTAssertNotNil(moved)
        XCTAssertEqual(
            formatISO8601UTC(moved!.start),
            "2026-01-02T10:00:00.000Z"
        )
    }

    private func parseISO(_ value: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value) else {
            throw NSError(domain: "test", code: 0)
        }
        return date
    }

    private func formatISO8601UTC(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }
}
