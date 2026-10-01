import CompassKit
import XCTest

final class AppOriginTests: XCTestCase {
    private let app = URL(string: "https://compasscalendar.com")!

    func testAllowsTheAppOrigin() {
        let url = URL(string: "https://compasscalendar.com/week?date=2026-10-01")!
        XCTAssertEqual(AppOrigin.decide(url, isMainFrame: true, appURL: app), .allow)
    }

    func testTreatsDefaultPortAsTheSameOrigin() {
        let url = URL(string: "https://compasscalendar.com:443/day")!
        XCTAssertEqual(AppOrigin.decide(url, isMainFrame: true, appURL: app), .allow)
    }

    func testOpensOtherHostsExternally() {
        for raw in [
            "https://staging.compasscalendar.com/",
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://evil.compasscalendar.com.example/",
            "http://compasscalendar.com/",
            "https://compasscalendar.com:8443/",
            "mailto:hello@compasscalendar.com",
        ] {
            let url = URL(string: raw)!
            XCTAssertEqual(
                AppOrigin.decide(url, isMainFrame: true, appURL: app), .openExternally, raw)
        }
    }

    func testLoadsSubframesInPlace() {
        let url = URL(string: "https://js.stripe.com/v3/checkout")!
        XCTAssertEqual(AppOrigin.decide(url, isMainFrame: false, appURL: app), .allow)
    }

    func testAllowsAboutBlank() {
        let url = URL(string: "about:blank")!
        XCTAssertEqual(AppOrigin.decide(url, isMainFrame: true, appURL: app), .allow)
    }

    func testResolvePrefersOverrideThenInfoValue() {
        XCTAssertEqual(
            AppOrigin.resolve(override: "http://localhost:9080", infoValue: "https://compasscalendar.com"),
            URL(string: "http://localhost:9080")!)
        XCTAssertEqual(
            AppOrigin.resolve(override: nil, infoValue: "https://compasscalendar.com"),
            URL(string: "https://compasscalendar.com")!)
        XCTAssertEqual(
            AppOrigin.resolve(override: nil, infoValue: nil),
            AppHostPreference.productionURL)
    }

    func testResolveIgnoresValuesThatAreNotWebURLs() {
        XCTAssertEqual(
            AppOrigin.resolve(override: "not a url", infoValue: "file:///etc/passwd"),
            AppOrigin.defaultURL)
    }
}
