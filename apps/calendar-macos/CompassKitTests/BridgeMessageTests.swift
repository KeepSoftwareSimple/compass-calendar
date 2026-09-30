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

    func testRejectsUnknownMethods() {
        let data = Data("{\"method\":\"unknown\"}".utf8)
        XCTAssertThrowsError(try BridgeMessageCodec.decode(from: data)) { error in
            XCTAssertEqual(error as? BridgeMessageError, .unknownMethod("unknown"))
        }
    }
}
