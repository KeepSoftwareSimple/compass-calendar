import CompassKit
import XCTest

final class BillingAppAccessTests: XCTestCase {
    private func status(
        _ subscriptionStatus: SubscriptionStatusEnum,
        isReadOnly: Bool,
        trialEndsAt: String? = nil,
        cancelAtPeriodEnd: Bool = false
    ) -> BillingStatusResponse {
        BillingStatusResponse(
            cancelAtPeriodEnd: cancelAtPeriodEnd,
            isReadOnly: isReadOnly,
            subscriptionStatus: subscriptionStatus,
            trialEndsAt: trialEndsAt
        )
    }

    func testAnonymousIsOpenEvenWhenEnforced() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: false,
                enforcement: true,
                billingConfigured: true,
                configLoadFailed: false,
                status: status(.awaitingCheckout, isReadOnly: true),
                statusPending: false,
                statusLoadFailed: false
            ))
        XCTAssertEqual(access, .open)
    }

    func testPausedEnforcementIsOpen() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: true,
                enforcement: false,
                billingConfigured: true,
                configLoadFailed: false,
                status: status(.awaitingCheckout, isReadOnly: true),
                statusPending: false,
                statusLoadFailed: false
            ))
        XCTAssertEqual(access, .open)
    }

    func testConfigErrorFailsOpen() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: true,
                enforcement: true,
                billingConfigured: true,
                configLoadFailed: true,
                status: status(.awaitingCheckout, isReadOnly: true),
                statusPending: false,
                statusLoadFailed: false
            ))
        XCTAssertEqual(access, .open)
    }

    func testStatusPendingFailsOpen() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: true,
                enforcement: true,
                billingConfigured: true,
                configLoadFailed: false,
                status: nil,
                statusPending: true,
                statusLoadFailed: false
            ))
        XCTAssertEqual(access, .open)
    }

    func testTrialingWritableAccess() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: true,
                enforcement: true,
                billingConfigured: true,
                configLoadFailed: false,
                status: status(
                    .trialing,
                    isReadOnly: false,
                    trialEndsAt: "2026-10-10T00:00:00.000Z"),
                statusPending: false,
                statusLoadFailed: false
            ))
        XCTAssertEqual(
            access,
            .server(
                BillingServerAccess(
                    status: .trialing,
                    isReadOnly: false,
                    trialEndsAt: "2026-10-10T00:00:00.000Z",
                    cancelAtPeriodEnd: false
                )))
        XCTAssertNil(BillingAppAccessResolver.gateStatus(access: access))
    }

    func testAwaitingCheckoutShowsGate() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: true,
                enforcement: true,
                billingConfigured: true,
                configLoadFailed: false,
                status: status(.awaitingCheckout, isReadOnly: true),
                statusPending: false,
                statusLoadFailed: false
            ))
        XCTAssertEqual(BillingAppAccessResolver.gateStatus(access: access), .awaitingCheckout)
        let copy = BillingGateCopy.content(for: .awaitingCheckout)
        XCTAssertEqual(copy.primaryLabel, "Add card")
    }

    func testCanceledReadOnlyShowsSubscribeGate() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: true,
                enforcement: true,
                billingConfigured: true,
                configLoadFailed: false,
                status: status(.canceled, isReadOnly: true),
                statusPending: false,
                statusLoadFailed: false
            ))
        XCTAssertEqual(BillingAppAccessResolver.gateStatus(access: access), .canceled)
        let copy = BillingGateCopy.content(for: .canceled)
        XCTAssertEqual(copy.primaryLabel, "Subscribe")
    }

    func testPastDueRemainsWritableWithoutGate() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: true,
                enforcement: true,
                billingConfigured: true,
                configLoadFailed: false,
                status: status(.pastDue, isReadOnly: false),
                statusPending: false,
                statusLoadFailed: false
            ))
        XCTAssertNil(BillingAppAccessResolver.gateStatus(access: access))
        XCTAssertEqual(
            BillingPlanBadgeResolver.badge(access: access)?.label,
            "Payment due"
        )
    }

    func testActivePremiumBadge() {
        let access = BillingAppAccessResolver.resolve(
            .init(
                authenticated: true,
                enforcement: true,
                billingConfigured: true,
                configLoadFailed: false,
                status: status(.active, isReadOnly: false),
                statusPending: false,
                statusLoadFailed: false
            ))
        XCTAssertEqual(BillingPlanBadgeResolver.badge(access: access)?.label, "Premium")
    }
}
