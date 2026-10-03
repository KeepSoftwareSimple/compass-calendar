import Foundation

/// Gate modal copy aligned with `BillingGateModal.tsx`.
public enum BillingGateCopy {
    public struct Content: Equatable, Sendable {
        public let title: String
        public let body: String
        public let primaryLabel: String

        public init(title: String, body: String, primaryLabel: String) {
            self.title = title
            self.body = body
            self.primaryLabel = primaryLabel
        }
    }

    public static func content(for status: SubscriptionStatusEnum) -> Content {
        if status == .awaitingCheckout {
            return Content(
                title: "Finish starting your trial",
                body: "Add a card to start your 7-day free trial. You will not be charged until it ends.",
                primaryLabel: "Add card"
            )
        }
        return Content(
            title: "Subscribe to keep using Compass",
            body: "Your trial has ended. Subscribe to keep creating and editing events, including keyboard shortcuts.",
            primaryLabel: "Subscribe"
        )
    }
}
