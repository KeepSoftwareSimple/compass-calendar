import CompassKit
import Foundation

private struct BillingCheckoutRequestBody: Encodable, Sendable {
    let returnTo: String

    init(returnTo: String = "desktop") {
        self.returnTo = returnTo
    }
}

public struct BillingAPI: Sendable {
    private let client: CompassAPIClient

    public init(client: CompassAPIClient) {
        self.client = client
    }

    public func getStatus() async throws -> BillingStatusResponse {
        try await client.sendDecodable(method: "GET", path: "billing/status")
    }

    public func getSubscription() async throws -> BillingSubscriptionResponse {
        try await client.sendDecodable(method: "GET", path: "billing/subscription")
    }

    public func createCheckoutSession() async throws -> BillingCheckoutResponse {
        try await client.sendDecodable(
            method: "POST",
            path: "billing/checkout/session",
            body: BillingCheckoutRequestBody())
    }

    public func createPaymentMethodSession() async throws -> BillingCheckoutResponse {
        try await client.sendDecodable(
            method: "POST",
            path: "billing/payment-method/session",
            body: BillingCheckoutRequestBody())
    }

    public func endTrial() async throws -> BillingStatusResponse {
        try await client.sendDecodable(method: "POST", path: "billing/trial/end")
    }

    public func cancelSubscription() async throws -> BillingStatusResponse {
        try await client.sendDecodable(method: "POST", path: "billing/subscription/cancel")
    }

    public func resumeSubscription() async throws -> BillingStatusResponse {
        try await client.sendDecodable(method: "POST", path: "billing/subscription/resume")
    }
}
