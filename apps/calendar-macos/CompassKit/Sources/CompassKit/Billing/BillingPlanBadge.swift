import Foundation

public enum BillingPlanBadgeTone: String, Sendable {
    case premium
    case trial
    case attention
    case neutral
}

public struct BillingPlanBadge: Equatable, Sendable {
    public let label: String
    public let tone: BillingPlanBadgeTone

    public init(label: String, tone: BillingPlanBadgeTone) {
        self.label = label
        self.tone = tone
    }
}

/// Mirrors `getPlanBadge` in `apps/calendar-web/src/billing/planBadge.ts`.
public enum BillingPlanBadgeResolver {
    public static func badge(
        access: BillingAppAccess,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> BillingPlanBadge? {
        guard case let .server(server) = access else { return nil }
        switch server.status {
        case .active:
            return BillingPlanBadge(label: "Premium", tone: .premium)
        case .trialing:
            if let trialEndsAt = server.trialEndsAt {
                let days = BillingTrialFormatting.daysLeft(
                    trialEndsAt: trialEndsAt,
                    now: now,
                    calendar: calendar
                )
                return BillingPlanBadge(
                    label: "Trial · \(BillingTrialFormatting.badgeLabel(daysLeft: days))",
                    tone: .trial
                )
            }
            return BillingPlanBadge(label: "Trial", tone: .trial)
        case .pastDue:
            return BillingPlanBadge(label: "Payment due", tone: .attention)
        case .awaitingCheckout:
            return BillingPlanBadge(label: "Free", tone: .neutral)
        case .expired, .canceled:
            return BillingPlanBadge(label: "Expired", tone: .attention)
        case .none:
            return nil
        }
    }
}
