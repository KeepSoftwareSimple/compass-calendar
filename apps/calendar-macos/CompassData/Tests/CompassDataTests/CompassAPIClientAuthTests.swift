import CompassData
import CompassKit
import XCTest

private final class LockedBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: T

    init(_ value: T) {
        self.value = value
    }

    func withLock<R>(_ body: (inout T) -> R) -> R {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }
}

final class CompassAPIClientAuthTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.Handler.requestHandler = nil
        super.tearDown()
    }

    func testInjectsAuthorizationHeaderOnProtectedRequest() async throws {
        let store = MemorySessionStore(
            tokens: SessionTokens(accessToken: "access-1", refreshToken: "refresh-1", frontToken: "front-1")
        )
        let capturedAuth = LockedBox<String?>(nil)
        StubURLProtocol.Handler.requestHandler = { request in
            capturedAuth.withLock { $0 = request.value(forHTTPHeaderField: "Authorization") }
            return StubURLProtocol.Response(
                statusCode: 200,
                body: Data("""
                {"email":"a@example.com","firstName":"A","lastName":"B","locale":"en","name":"A B","picture":"","userId":"u1"}
                """.utf8)
            )
        }
        let client = CompassAPIClient(
            appURL: URL(string: "https://www.compasscalendar.com")!,
            sessionStore: store,
            urlSession: StubURLProtocol.makeSession()
        )

        _ = try await client.user.profile()
        XCTAssertEqual(capturedAuth.withLock { $0 }, "Bearer access-1")
    }

    func testRefreshSingleFlightOnConcurrentUnauthorized() async throws {
        let store = MemorySessionStore(
            tokens: SessionTokens(accessToken: "old-access", refreshToken: "old-refresh", frontToken: "old-front")
        )
        let metrics = LockedBox((profileCalls: 0, refreshCalls: 0))

        StubURLProtocol.Handler.requestHandler = { request in
            let path = request.url?.path ?? ""
            if path.hasSuffix("/session/refresh") {
                metrics.withLock { $0.refreshCalls += 1 }
                return StubURLProtocol.Response(
                    statusCode: 200,
                    headers: [
                        SessionHeader.accessToken: "new-access",
                        SessionHeader.refreshToken: "new-refresh",
                        SessionHeader.frontToken: "new-front",
                    ]
                )
            }
            if path.hasSuffix("/user/profile") {
                let count = metrics.withLock {
                    $0.profileCalls += 1
                    return $0.profileCalls
                }
                if count <= 2 {
                    return StubURLProtocol.Response(statusCode: 401, body: Data("try refresh token".utf8))
                }
                return StubURLProtocol.Response(
                    statusCode: 200,
                    body: Data("""
                    {"email":"a@example.com","firstName":"A","lastName":"B","locale":"en","name":"A B","picture":"","userId":"u1"}
                    """.utf8)
                )
            }
            return StubURLProtocol.Response(statusCode: 404)
        }

        let client = CompassAPIClient(
            appURL: URL(string: "https://www.compasscalendar.com")!,
            sessionStore: store,
            urlSession: StubURLProtocol.makeSession()
        )

        async let first: UserProfile = client.user.profile()
        async let second: UserProfile = client.user.profile()
        _ = try await (first, second)

        XCTAssertEqual(metrics.withLock { $0.refreshCalls }, 1)
        let stored = try store.load()
        XCTAssertEqual(stored?.accessToken, "new-access")
    }
}
