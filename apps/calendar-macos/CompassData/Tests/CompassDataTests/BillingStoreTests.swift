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
          "sync": {
            "cloudMutationMode": "enabled",
            "execution": "passive"
          }
        }
        """.utf8)
}

@MainActor
final class BillingStoreTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.Handler.requestHandler = nil
        super.tearDown()
    }

    private func makeStore() throws -> (BillingStore, ConfigStore) {
        let client = CompassAPIClient(
            appURL: URL(string: "https://www.compasscalendar.com")!,
            sessionStore: MemorySessionStore(tokens: SessionTokens(
                accessToken: "access",
                refreshToken: "refresh",
                frontToken: "front")),
            urlSession: StubURLProtocol.makeSession())
        let configStore = ConfigStore(apiClient: client)
        let store = BillingStore(apiClient: client, configStore: configStore)
        return (store, configStore)
    }

    func testGateStatusTracksReadOnlyAwaitingCheckout() async throws {
        let (store, configStore) = try makeStore()
        StubURLProtocol.Handler.requestHandler = { request in
            if request.url?.path.hasSuffix("/config") == true {
                return StubURLProtocol.Response(
                    statusCode: 200,
                    body: BillingStoreTestFixtures.enforcedConfigJSON)
            }
            if request.url?.path.hasSuffix("/billing/status") == true {
                let body = """
                {"subscriptionStatus":"awaiting_checkout","trialEndsAt":null,"isReadOnly":true,"cancelAtPeriodEnd":false}
                """
                return StubURLProtocol.Response(statusCode: 200, body: Data(body.utf8))
            }
            return StubURLProtocol.Response(statusCode: 404)
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
        StubURLProtocol.Handler.requestHandler = { request in
            if request.url?.path.hasSuffix("/config") == true {
                return StubURLProtocol.Response(
                    statusCode: 200,
                    body: BillingStoreTestFixtures.enforcedConfigJSON)
            }
            if request.url?.path.hasSuffix("/billing/status") == true {
                let body = """
                {"subscriptionStatus":"trialing","trialEndsAt":"2026-10-10T00:00:00.000Z","isReadOnly":false,"cancelAtPeriodEnd":false}
                """
                return StubURLProtocol.Response(statusCode: 200, body: Data(body.utf8))
            }
            return StubURLProtocol.Response(statusCode: 404)
        }
        await configStore.load()
        store.setAuthenticated(true)
        await store.refreshStatus()
        XCTAssertNotNil(configStore.config)
        XCTAssertEqual(store.status?.subscriptionStatus, .trialing)
        XCTAssertNil(store.gateStatus)
    }
}
