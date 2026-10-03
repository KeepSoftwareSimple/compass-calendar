import CompassData
import CompassKit
import SwiftUI

public struct TrialBadgeView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore

    public init(billingStore: BillingStore) {
        self.billingStore = billingStore
    }

    public var body: some View {
        if case let .server(server) = billingStore.appAccess,
           server.status == .trialing,
           let trialEndsAt = server.trialEndsAt
        {
            let days = BillingTrialFormatting.daysLeft(trialEndsAt: trialEndsAt)
            let description = server.cancelAtPeriodEnd
                ? "\(BillingTrialFormatting.badgeDescription(daysLeft: days)). It will not renew"
                : BillingTrialFormatting.badgeDescription(daysLeft: days)
            Button {
                billingStore.isUpgradeConfirmationPresented = true
            } label: {
                Text(BillingTrialFormatting.badgeLabel(daysLeft: days))
                    .font(.custom("Rubik", size: 11))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(theme.borderColor.opacity(0.35))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.textColor)
            .help(description)
            .accessibilityLabel("\(description). Subscribe now.")
        }
    }
}
