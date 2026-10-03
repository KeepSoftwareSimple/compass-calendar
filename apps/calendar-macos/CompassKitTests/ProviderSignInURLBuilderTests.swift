import XCTest
@testable import CompassKit

final class ProviderSignInURLBuilderTests: XCTestCase {
    private let appURL = URL(string: "https://www.compasscalendar.com")!
    private let apiURL = URL(string: "https://www.compasscalendar.com/api")!
    private let clients = OAuthPublicClients(
        googleClientId: "google-client",
        microsoftClientId: "ms-client",
        appleServicesId: "apple.services")

    func testGoogleAuthorizationURLContainsStateAndRedirect() throws {
        let state = DesktopOAuthState.buildOAuthStateForDesktop()
        let url = try XCTUnwrap(
            ProviderSignInURLBuilder.buildGoogleAuthorizationURL(
                appURL: appURL,
                clients: clients,
                state: state))
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "state" }?.value, state)
        XCTAssertEqual(
            items.first { $0.name == "redirect_uri" }?.value,
            "https://www.compasscalendar.com/auth/google/callback")
    }

    func testMicrosoftAuthorizationURL() throws {
        let url = try XCTUnwrap(
            ProviderSignInURLBuilder.buildMicrosoftAuthorizationURL(
                appURL: appURL,
                clients: clients,
                state: "compass-desktop:test"))
        XCTAssertTrue(url.absoluteString.contains("login.microsoftonline.com"))
    }

    func testAppleAuthorizationURLUsesFormPostRedirect() throws {
        let url = try XCTUnwrap(
            ProviderSignInURLBuilder.buildAppleAuthorizationURL(
                appURL: appURL,
                apiBaseURL: apiURL,
                clients: clients))
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "response_mode" }?.value, "form_post")
        XCTAssertEqual(
            items.first { $0.name == "redirect_uri" }?.value,
            "https://www.compasscalendar.com/api/auth/apple/callback")
    }
}
