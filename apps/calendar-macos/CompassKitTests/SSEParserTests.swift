import CompassKit
import XCTest

final class SSEParserTests: XCTestCase {
    func testParsesNamedEventWithSingleDataLine() {
        let messages = SSEParser.parse(
            """
            event: message
            data: {"type":"eventsChanged"}

            """
        )
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages[0].event, "message")
        XCTAssertEqual(messages[0].data, "{\"type\":\"eventsChanged\"}")
    }

    func testJoinsMultiLineData() {
        let messages = SSEParser.parse(
            """
            data: line1
            data: line2

            """
        )
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages[0].data, "line1\nline2")
    }

    func testParsesRetryHint() {
        let messages = SSEParser.parse(
            """
            retry: 5000

            """
        )
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages[0].retryMilliseconds, 5000)
    }

    func testIgnoresComments() {
        let messages = SSEParser.parse(
            """
            : keepalive
            event: message
            data: ok

            """
        )
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages[0].data, "ok")
    }

    func testMultipleEventsInOnePayload() {
        let messages = SSEParser.parse(
            """
            event: message
            data: one

            event: message
            data: two

            """
        )
        XCTAssertEqual(messages.map(\.data), ["one", "two"])
    }
}
