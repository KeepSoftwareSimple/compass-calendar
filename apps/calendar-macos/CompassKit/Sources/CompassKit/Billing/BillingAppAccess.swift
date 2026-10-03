import Foundation

public struct BillingServerAccess: Equatable, Sendable {
    public let status: SubscriptionStatusEnum
    public let isReadOnly: Bool
    public let trialEndsAt: String?
    public let cancelAtPeriodEnd: Bool

    public init(
        status: SubscriptionStatusEnum,
        isReadOnly: Bool,
        trialEndsAt: String?,
        cancelAtPeriodEnd: Bool
    ) {
        self.status = status
        self.isReadOnly = isReadOnly
        self.trialEndsAt = trialEndsAt
        self.cancelAtPeriodEnd = cancelAtPeriodEnd
    }
}

/// Mirrors `useAppAccess` in `apps/calendar-web/src/billing/useAppAccess.ts`.
public enum BillingAppAccess: Equatable, Sendable {
    case open
    case server(BillingServerAccess)
}

public enum BillingAppAccessResolver {
    public struct Inputs: Sendable {
        public let authenticated: Bool
        public let enforcement: Bool?
        public let billingConfigured: Bool?
        public let configLoadFailed: Bool
        public let status: BillingStatusResponse?
        public let statusPending: Bool
        public let statusLoadFailed: Bool

        public init(
            authenticated: Bool,
            enforcement: Bool?,
            billingConfigured: Bool?,
            configLoadFailed: Bool,
            status: BillingStatusResponse?,
            statusPending: Bool,
            statusLoadFailed: Bool
        ) {
            self.authenticated = authenticated
            self.enforcement = enforcement
            self.billingConfigured = billingConfigured
            self.configLoadFailed = configLoadFailed
            self.status = status
            self.statusPending = statusPending
            self.statusLoadFailed = statusLoadFailed
        }
    }

    public static func resolve(_ inputs: Inputs) -> BillingAppAccess {
        guard inputs.enforcement == true else {
            return .open
        }
        if !inputs.authenticated {
            return .open
        }
        if inputs.configLoadFailed || inputs.billingConfigured != true {
            return .open
        }
        if inputs.statusLoadFailed || inputs.statusPending || inputs.status == nil {
            return .open
        }
        let status = inputs.status!
        return .server(
            BillingServerAccess(
                status: status.subscriptionStatus,
                isReadOnly: status.isReadOnly,
                trialEndsAt: status.trialEndsAt,
                cancelAtPeriodEnd: status.cancelAtPeriodEnd
            ))
    }

    public static func gateStatus(access: BillingAppAccess) -> SubscriptionStatusEnum? {
        guard case let .server(server) = access, server.isReadOnly else {
            return nil
        }
        return server.status
    }

    public static func isBillingEnforced(config: AppConfig?) -> Bool {
        config?.billing.enforcement == true
    }
}
