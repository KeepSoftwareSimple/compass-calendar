import CompassData
import XCTest

final class AuthInterceptorTests: XCTestCase {
    func testAppliesBearerAndHeaderMode() {
        var request = URLRequest(url: URL(string: "https://example.com/api/user/profile")!)
        let interceptor = AuthInterceptor()
        let tokens = SessionTokens(accessToken: "access", refreshToken: "refresh", frontToken: "front")
        interceptor.apply(to: &request, mode: .bearerAccess, tokens: tokens)

        XCTAssertEqual(request.value(forHTTPHeaderField: SessionHeader.authMode), SessionHeader.headerModeValue)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access")
    }

    func testDetectsRefreshSignal() {
        let interceptor = AuthInterceptor()
        XCTAssertTrue(interceptor.shouldRefreshAfterUnauthorized(body: "try refresh token"))
        XCTAssertFalse(interceptor.shouldRefreshAfterUnauthorized(body: "nope"))
    }

    func testParsesSessionHeaders() {
        let url = URL(string: "https://example.com")!
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: nil,
            headerFields: [
                SessionHeader.accessToken: "a",
                SessionHeader.refreshToken: "r",
                SessionHeader.frontToken: "f",
            ]
        )!
        let tokens = AuthInterceptor().tokens(from: response)
        XCTAssertEqual(tokens, SessionTokens(accessToken: "a", refreshToken: "r", frontToken: "f"))
    }
}
