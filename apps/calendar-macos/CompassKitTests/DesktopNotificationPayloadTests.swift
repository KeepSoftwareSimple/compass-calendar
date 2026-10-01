import CompassKit
import XCTest

final class DesktopNotificationPayloadTests: XCTestCase {
    func testRoundTripsThroughUserInfoCodec() throws {
        let payload = DesktopNotificationPayload(
            title: "Standup",
            body: "Starts at 9:00 AM",
            tag: "evt-1|2026-10-01T14:00:00.000Z",
            eventId: "evt-1")

        let userInfo = try DesktopNotificationPayloadCodec.userInfo(for: payload)
        let decoded = try DesktopNotificationPayloadCodec.decode(from: userInfo)

        XCTAssertEqual(decoded, payload)
    }
}
