import XCTest
@testable import CompassKit

final class DesktopOAuthStateTests: XCTestCase {
    func testBuildOAuthStateForDesktopHasMarker() {
        let state = DesktopOAuthState.buildOAuthStateForDesktop()
        XCTAssertTrue(DesktopOAuthState.hasDesktopOAuthStateMarker(state))
    }

    func testBuildDesktopOAuthRelayUrl() {
        XCTAssertEqual(
            DesktopOAuthState.buildDesktopOAuthRelayUrl(
                provider: "google",
                search: "?code=abc&state=compass-desktop%3Aid"),
            "compass://auth/google/callback?code=abc&state=compass-desktop%3Aid")
    }

    func testParseDesktopAuthDeepLink() {
        let parsed = DesktopOAuthState.parseDesktopAuthDeepLink(
            "compass://auth/google/callback?code=abc&state=x")
        XCTAssertEqual(parsed?.provider, "google")
        XCTAssertEqual(parsed?.query, "?code=abc&state=x")
        XCTAssertNil(DesktopOAuthState.parseDesktopAuthDeepLink("compass://auth/yahoo/callback"))
    }

    func testParseDesktopConnectDeepLink() {
        let parsed = DesktopOAuthState.parseDesktopConnectDeepLink(
            "compass://connect/google/callback?status=connected")
        XCTAssertEqual(parsed?.provider, "google")
        XCTAssertEqual(parsed?.query, "?status=connected")
        XCTAssertNil(DesktopOAuthState.parseDesktopConnectDeepLink("compass://connect/yahoo/callback"))
        XCTAssertNil(DesktopOAuthState.parseDesktopConnectDeepLink("compass://auth/google/callback"))
    }

    func testQueryValueFromDeepLinkQuery() {
        XCTAssertEqual(
            DesktopOAuthState.queryValue("status", fromDeepLinkQuery: "?status=connected&desktop=1"),
            "connected")
        XCTAssertEqual(
            DesktopOAuthState.queryValue("code", fromDeepLinkQuery: "code=abc&state=x"),
            "abc")
        XCTAssertNil(DesktopOAuthState.queryValue("code", fromDeepLinkQuery: ""))
    }
}
