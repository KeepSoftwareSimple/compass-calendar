import CompassData
import CompassKit
import SwiftUI

public struct BillingPlanSectionView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore

    public init(billingStore: BillingStore) {
        self.billingStore = billingStore
    }

    public var body: some View {
        if let badge = BillingPlanBadgeResolver.badge(access: billingStore.appAccess) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Plan")
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textMutedColor)
                planBadgeView(badge)
                if let summary = billingStore.subscription {
                    subscriptionDetails(summary)
                    actionButtons(summary)
                    receiptsTable(summary.invoices)
                } else if billingStore.isLoadingSubscription {
                    Text("Loading your plan")
                        .font(.custom("Rubik", size: 12))
                        .foregroundStyle(theme.textMutedColor)
                }
                if let actionError = billingStore.actionError {
                    Text(actionError)
                        .font(.custom("Rubik", size: 12))
                        .foregroundStyle(theme.errorColor)
                }
            }
            .onAppear {
                Task { await billingStore.refreshSubscriptionDetails() }
            }
            .overlay {
                if billingStore.isCancelConfirmationPresented,
                   let summary = billingStore.subscription
                {
                    let periodEnd = summary.currentPeriodEnd ?? summary.trialEndsAt ?? ""
                    BillingCancelConfirmationSheet(
                        billingStore: billingStore,
                        periodEndLabel: BillingDisplayFormatting.formatBillingDate(iso: periodEnd),
                        isTrialing: summary.subscriptionStatus == .trialing
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func planBadgeView(_ badge: BillingPlanBadge) -> some View {
        Text(badge.label)
            .font(.custom("Rubik", size: 11))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(theme.borderColor))
            .foregroundStyle(badgeForeground(badge.tone))
    }

    @ViewBuilder
    private func subscriptionDetails(_ summary: BillingSubscriptionResponse) -> some View {
        if let price = summary.price {
            Text(
                BillingDisplayFormatting.formatPriceLine(
                    amountMinor: price.amount,
                    currency: price.currency,
                    interval: price.interval.rawValue
                )
            )
            .font(.custom("Rubik", size: 13))
            .foregroundStyle(theme.textColor)
        }
        if let periodEnd = summary.currentPeriodEnd {
            Text("\(summary.cancelAtPeriodEnd ? "Ends" : "Renews") \(BillingDisplayFormatting.formatBillingDate(iso: periodEnd))")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
        }
        if case let .server(server) = billingStore.appAccess,
           server.status == .trialing,
           let trialEndsAt = server.trialEndsAt
        {
            Text("Your trial ends \(BillingDisplayFormatting.formatBillingDate(iso: trialEndsAt))\(server.cancelAtPeriodEnd ? " and will not renew" : "").")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
        }
        if let card = summary.paymentMethod {
            Text(
                BillingDisplayFormatting.formatCardOnFile(
                    brand: card.brand,
                    last4: card.last4,
                    expMonth: Int(card.expMonth),
                    expYear: Int(card.expYear)
                )
            )
            .font(.custom("Rubik", size: 13))
            .foregroundStyle(theme.textColor)
        } else {
            Text("No card on file")
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.textColor)
        }
    }

    @ViewBuilder
    private func actionButtons(_ summary: BillingSubscriptionResponse) -> some View {
        let manageable: Set<SubscriptionStatusEnum> = [.trialing, .active, .pastDue]
        HStack(spacing: 8) {
            Button("Update card") {
                Task { await billingStore.openHostedPaymentMethodUpdate() }
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.textMutedColor)
            .disabled(billingStore.isSubmitting || billingStore.isOpeningHostedSession)
            if manageable.contains(summary.subscriptionStatus) {
                if summary.cancelAtPeriodEnd {
                    Button("Resume subscription") {
                        Task { await billingStore.resumeSubscription() }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.textMutedColor)
                    .disabled(billingStore.isSubmitting)
                } else if summary.currentPeriodEnd != nil || summary.trialEndsAt != nil {
                    Button("Cancel subscription") {
                        billingStore.isCancelConfirmationPresented = true
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.errorColor)
                    .disabled(billingStore.isSubmitting)
                }
            }
        }
    }

    @ViewBuilder
    private func receiptsTable(_ invoices: [BillingSubscriptionResponseInvoices]) -> some View {
        let rows = Array(invoices.prefix(12))
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Receipts")
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textColor)
                ForEach(rows, id: \.id) { invoice in
                    HStack {
                        Text(BillingDisplayFormatting.formatBillingDate(iso: invoice.createdAt))
                        Spacer()
                        Text(
                            BillingDisplayFormatting.formatMoney(
                                amountMinor: invoice.amountPaid,
                                currency: invoice.currency
                            )
                        )
                        Text(BillingDisplayFormatting.formatInvoiceStatus(invoice.status))
                        if let urlString = invoice.hostedInvoiceUrl, let url = URL(string: urlString) {
                            Link("Receipt", destination: url)
                        }
                    }
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textMutedColor)
                }
            }
        }
    }

    private func badgeForeground(_ tone: BillingPlanBadgeTone) -> Color {
        switch tone {
        case .premium: theme.successColor
        case .trial: theme.textColor
        case .attention: theme.warningColor
        case .neutral: theme.textMutedColor
        }
    }
}
