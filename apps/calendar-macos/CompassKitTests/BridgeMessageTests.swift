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
        {"method":"setAgenda","items":[{"id":"evt-1","title":"Standup","startsAt":"2026-10-01T14:00:00.000Z","endsAt":"2026-10-01T14:30:00.000Z"}]}
        """.utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .setAgenda(items: [
                DesktopAgendaItem(
                    id: "evt-1",
                    title: "Standup",
                    startsAt: "2026-10-01T14:00:00.000Z",
                    endsAt: "2026-10-01T14:30:00.000Z"),
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

    func testDecodesSetQuickAddHotkey() throws {
        let data = Data("""
        {"method":"setQuickAddHotkey","shortcut":"Ctrl+Option+Cmd+Space"}
        """.utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .setQuickAddHotkey(shortcut: "Ctrl+Option+Cmd+Space"))
    }

    func testDecodesDismissQuickAddPanel() throws {
        let data = Data("{\"method\":\"dismissQuickAddPanel\"}".utf8)
        XCTAssertEqual(try BridgeMessageCodec.decode(from: data), .dismissQuickAddPanel)
    }

    func testDecodesSetAppearance() throws {
        let data = Data("""
        {"method":"setAppearance","theme":"dark-abyss"}
        """.utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .setAppearance(theme: "dark-abyss"))
    }

    func testDecodesLaunchAtLoginMessages() throws {
        let setData = Data("""
        {"method":"setLaunchAtLogin","enabled":true}
        """.utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: setData),
            .setLaunchAtLogin(enabled: true))
        let getData = Data("{\"method\":\"getLaunchAtLogin\"}".utf8)
        XCTAssertEqual(try BridgeMessageCodec.decode(from: getData), .getLaunchAtLogin)
    }

    func testDecodesReportDeepLinkNavigation() throws {
        let data = Data("""
        {"method":"reportDeepLinkNavigation","path":"/day/2026-10-15"}
        """.utf8)
        XCTAssertEqual(
            try BridgeMessageCodec.decode(from: data),
            .reportDeepLinkNavigation(path: "/day/2026-10-15"))
    }

    func testRejectsUnknownMethods() {
        let data = Data("{\"method\":\"unknown\"}".utf8)
        XCTAssertThrowsError(try BridgeMessageCodec.decode(from: data)) { error in
            XCTAssertEqual(error as? BridgeMessageError, .unknownMethod("unknown"))
        }
    }
}
