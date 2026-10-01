import CompassKit
import XCTest

final class BridgeMessageTests: XCTestCase {
    func testDecodesOpenExternal() throws {
        let data = Data("""
        {"method":"openExternal","url":"https://example.com/path"}
        """.utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .openExternal(url: "https://example.com/path"))
    }

    func testDecodesSetAgenda() throws {
        let data = Data("""
        {"method":"setAgenda","items":[{"title":"Standup","startsAt":"2026-10-01T14:00:00.000Z"}]}
        """.utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .setAgenda(items: [
                DesktopAgendaItem(title: "Standup", startsAt: "2026-10-01T14:00:00.000Z"),
            ]))
    }

    func testDecodesRestartToUpdate() throws {
        let data = Data("{\"method\":\"restartToUpdate\"}".utf8)
        XCTAssertEqual(try BridgeMessageCodec.decode(from: data), .restartToUpdate)
    }

    func testDecodesRequestNotificationPermission() throws {
        let data = Data("{\"method\":\"requestNotificationPermission\"}".utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .requestNotificationPermission)
    }

    func testDecodesShowNotification() throws {
        let data = Data("""
        {"method":"showNotification","title":"Standup","body":"Starts at 9:00 AM","tag":"evt-1|2026-10-01T14:00:00.000Z","eventId":"evt-1"}
        """.utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .showNotification(
                payload: DesktopNotificationPayload(
                    title: "Standup",
                    body: "Starts at 9:00 AM",
                    tag: "evt-1|2026-10-01T14:00:00.000Z",
                    eventId: "evt-1")))
    }

    func testDecodesSetAppearance() throws {
        let data = Data("{\"method\":\"setAppearance\",\"theme\":\"dark-abyss\"}".utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .setAppearance(theme: .darkAbyss))
    }

    func testDecodesLaunchAtLoginMessages() throws {
        let get = Data("{\"method\":\"getLaunchAtLogin\"}".utf8)
        XCTAssertEqual(try BridgeMessageCodec.decode(from: get), .getLaunchAtLogin)
        let set = Data("{\"method\":\"setLaunchAtLogin\",\"enabled\":true}".utf8)
        XCTAssertEqual(try BridgeMessageCodec.decode(from: set), .setLaunchAtLogin(enabled: true))
    }

    func testRejectsUnknownMethods() {
        let data = Data("{\"method\":\"unknown\"}".utf8)
        XCTAssertThrowsError(try BridgeMessageCodec.decode(from: data)) { error in
            XCTAssertEqual(error as? BridgeMessageError, .unknownMethod("unknown"))
        }
    }
}
