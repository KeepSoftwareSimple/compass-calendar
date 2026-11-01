import Foundation

/// Mirrors `SUBSCRIPTION_CANCEL_REASONS` in
/// `packages/core/src/billing/subscription-cancel-reason.constants.ts`.
public enum SubscriptionCancelReason: String, CaseIterable, Sendable {
    case tooExpensive = "too_expensive"
    case missingFeature = "missing_feature"
    case switchedTool = "switched_tool"
    case notUsingEnough = "not_using_enough"
    case technicalProblems = "technical_problems"
    case other = "other"

    public var label: String {
        switch self {
        case .tooExpensive: "Too expensive"
        case .missingFeature: "Missing a feature"
        case .switchedTool: "Switched to another tool"
        case .notUsingEnough: "Not using it enough"
        case .technicalProblems: "Technical problems"
        case .other: "Other"
        }
    }
}

public struct SubscriptionCancelReasonSubmission: Sendable {
    public let reason: SubscriptionCancelReason
    public let details: String?

    public init(reason: SubscriptionCancelReason, details: String? = nil) {
        self.reason = reason
        self.details = details
    }
}
