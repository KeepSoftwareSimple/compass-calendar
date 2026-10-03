import CompassKit
import XCTest

final class DesktopDeepLinkTests: XCTestCase {
    func testAuthCallbackLinkIsRecognized() {
        let url =
            "compass://auth/google/callback?code=abc&state=compass-desktop%3Aid"
        XCTAssertEqual(DesktopDeepLinkParser.recognizedURLString(url), url)
    }

    func testDayLinkIsRecognized() {
        XCTAssertEqual(
            DesktopDeepLinkParser.recognizedURLString("compass://day/2026-10-15"),
            "compass://day/2026-10-15")
    }

    func testDayLinkNavigationPath() {
        XCTAssertEqual(
            DesktopDeepLinkParser.navigationPath(for: "compass://day/2026-10-15"),
            "/day/2026-10-15")
    }

    func testAuthCallbackNavigationPath() {
        XCTAssertEqual(
            DesktopDeepLinkParser.navigationPath(
                for: "compass://auth/google/callback?code=abc&state=x"),
            "/auth/google/callback?code=abc&state=x")
    }

    func testInvalidDayLinkIsIgnored() {
        XCTAssertNil(DesktopDeepLinkParser.recognizedURLString("compass://day/2026-13-40"))
        XCTAssertNil(DesktopDeepLinkParser.recognizedURLString("compass://day/not-a-date"))
    }

    func testUnknownLinkIsIgnored() {
        XCTAssertNil(DesktopDeepLinkParser.recognizedURLString("compass://agenda"))
        XCTAssertNil(DesktopDeepLinkParser.recognizedURLString("https://example.com"))
    }

    func testBillingCheckoutDeepLinkIsRecognized() {
        let url = "compass://billing/checkout?outcome=success&session_id=cs_test_123"
        XCTAssertEqual(DesktopDeepLinkParser.recognizedURLString(url), url)
        XCTAssertEqual(
            DesktopDeepLinkParser.parseBillingCheckout(from: url)?.sessionId,
            "cs_test_123")
        XCTAssertNil(DesktopDeepLinkParser.navigationPath(for: url))
    }

    func testColdStartQueuesUntilConsumerReady() {
        var inbox = DeepLinkInbox()
        XCTAssertEqual(
            inbox.receive(urlString: "compass://day/2026-10-15"),
            .queued)
        XCTAssertEqual(inbox.pending, ["compass://day/2026-10-15"])

        let flush = inbox.markConsumerReady()
        XCTAssertEqual(flush, ["compass://day/2026-10-15"])
        XCTAssertTrue(inbox.pending.isEmpty)
    }

    func testWarmStartDeliversImmediately() {
        var inbox = DeepLinkInbox(consumerReady: true)
        XCTAssertEqual(
            inbox.receive(urlString: "compass://day/2026-10-01"),
            .deliverNow("compass://day/2026-10-01"))
        XCTAssertTrue(inbox.pending.isEmpty)
    }

    func testDeepLinkRouterQueuesUntilConsumerReady() {
        var delivered: [String] = []
        var router = DeepLinkRouter()
        router.onDeliver = { delivered.append($0) }

        XCTAssertEqual(
            router.receive(urlString: "compass://day/2026-10-15"),
            .queued)
        XCTAssertTrue(delivered.isEmpty)

        router.markConsumerReady()
        XCTAssertEqual(delivered, ["compass://day/2026-10-15"])
    }

    func testDeepLinkRouterDeliversBillingAuthAndEventLinks() {
        var delivered: [String] = []
        var router = DeepLinkRouter(inbox: DeepLinkInbox(consumerReady: true))
        router.onDeliver = { delivered.append($0) }

        let billing = "compass://billing/checkout?outcome=success&session_id=cs_test"
        let auth = "compass://auth/google/callback?code=abc"
        let event = "compass://event/evt-1"
        _ = router.receive(urlString: billing)
        _ = router.receive(urlString: auth)
        _ = router.receive(urlString: event)

        XCTAssertEqual(delivered, [billing, auth, event])
    }

    func testIgnoredLinkDoesNotQueue() {
        var inbox = DeepLinkInbox()
        XCTAssertEqual(inbox.receive(urlString: "compass://unknown"), .ignored)
        XCTAssertTrue(inbox.pending.isEmpty)
    }
}
