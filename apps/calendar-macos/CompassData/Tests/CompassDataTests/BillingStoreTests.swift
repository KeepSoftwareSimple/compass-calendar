import CompassData
import CompassKit
import XCTest

private enum BillingStoreTestFixtures {
    static let enforcedConfigJSON = Data(
        """
        {
          "version": "1",
          "billing": {
            "isConfigured": true,
            "enforcement": true,
            "trialLengthDays": 7,
            "publishableKey": "pk_test"
          },
          "providers": {
            "google": { "signIn": false, "connect": false },
            "microsoft": { "signIn": false, "connect": false },
            "apple": { "signIn": false, "connect": false }
          },
          "sync": { "enabled": true }
        }
        """.utf8)
}

private enum BillingStoreURLStub {
    struct Response {
        var statusCode: Int
        var headers: [String: String]
        var body: Data

        init(statusCode: Int, headers: [String: String] = [:], body: Data = Data()) {
            self.statusCode = statusCode
            self.headers = headers
            self.body = body
        }
    }

    final class Handler: URLProtocol, @unchecked Sendable {
        nonisolated(unsafe) static var requestHandler: (@Sendable (URLRequest) throws -> Response)?

        override class func canInit(with request: URLRequest) -> Bool {
            requestHandler != nil
        }

        override class func canonicalRequest(for request: URLRequest) -> URLRequest {
            request
        }

        override func startLoading() {
            guard let handler = Self.requestHandler else {
                client?.urlProtocolDidFinishLoading(self)
                return
            }
            do {
                let response = try handler(request)
                let http = HTTPURLResponse(
                    url: request.url!,
                    statusCode: response.statusCode,
                    httpVersion: nil,
                    headerFields: response.headers
                )!
                client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
                if !response.body.isEmpty {
                    client?.urlProtocol(self, didLoad: response.body)
                }
                client?.urlProtocolDidFinishLoading(self)
            } catch {
                client?.urlProtocol(self, didFailWithError: error)
            }
        }

        override func stopLoading() {}
    }

    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [Handler.self]
        return URLSession(configuration: config)
    }
}

@MainActor
final class BillingStoreTests: XCTestCase {
    override class var parallelTestExecutionEnabled: Bool { false }

    override func tearDown() {
        BillingStoreURLStub.Handler.requestHandler = nil
        super.tearDown()
    }

    private func makeStore() throws -> (BillingStore, ConfigStore) {
        let client = CompassAPIClient(
            appURL: URL(string: "https://www.compasscalendar.com")!,
            sessionStore: MemorySessionStore(tokens: SessionTokens(
                accessToken: "access",
                refreshToken: "refresh",
                frontToken: "front")),
            urlSession: BillingStoreURLStub.makeSession())
        let configStore = ConfigStore(apiClient: client)
        let store = BillingStore(apiClient: client, configStore: configStore)
        return (store, configStore)
    }

    func testGateStatusTracksReadOnlyAwaitingCheckout() async throws {
        let (store, configStore) = try makeStore()
        BillingStoreURLStub.Handler.requestHandler = { request in
            if request.url?.path.hasSuffix("/config") == true {
                return BillingStoreURLStub.Response(
                    statusCode: 200,
                    body: BillingStoreTestFixtures.enforcedConfigJSON)
            }
            if request.url?.path.hasSuffix("/billing/status") == true {
                let body = """
                {"subscriptionStatus":"awaiting_checkout","trialEndsAt":null,"isReadOnly":true,"cancelAtPeriodEnd":false}
                """
                return BillingStoreURLStub.Response(statusCode: 200, body: Data(body.utf8))
            }
            return BillingStoreURLStub.Response(statusCode: 404)
        }
        await configStore.load()
        store.setAuthenticated(true)
        await store.refreshStatus()
        XCTAssertNotNil(configStore.config)
        XCTAssertEqual(store.status?.subscriptionStatus, .awaitingCheckout)
        XCTAssertEqual(store.gateStatus, .awaitingCheckout)
    }

    func testTrialingHasNoGate() async throws {
        let (store, configStore) = try makeStore()
        BillingStoreURLStub.Handler.requestHandler = { request in
            if request.url?.path.hasSuffix("/config") == true {
                return BillingStoreURLStub.Response(
                    statusCode: 200,
                    body: BillingStoreTestFixtures.enforcedConfigJSON)
            }
            if request.url?.path.hasSuffix("/billing/status") == true {
                let body = """
                {"subscriptionStatus":"trialing","trialEndsAt":"2026-10-10T00:00:00.000Z","isReadOnly":false,"cancelAtPeriodEnd":false}
                """
                return BillingStoreURLStub.Response(statusCode: 200, body: Data(body.utf8))
            }
            return BillingStoreURLStub.Response(statusCode: 404)
        }
        await configStore.load()
        store.setAuthenticated(true)
        await store.refreshStatus()
        XCTAssertNotNil(configStore.config)
        XCTAssertEqual(store.status?.subscriptionStatus, .trialing)
        XCTAssertNil(store.gateStatus)
    }
}
