import CompassData
import SwiftUI

public struct BillingUpgradeConfirmationSheet: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore

    public init(billingStore: BillingStore) {
        self.billingStore = billingStore
    }

    public var body: some View {
        if billingStore.isUpgradeConfirmationPresented {
            BillingDialogPanel(
                title: "Start Premium now?",
                message: "Premium starts right away and the card on file is charged today. Everything in your calendar keeps working, and the trial badge goes away. Manage billing opens your invoices and card on file. It does not charge you or end the trial.",
                primaryTitle: billingStore.isSubmitting ? "Starting Premium…" : "Start Premium",
                primaryDestructive: false,
                primaryAction: { Task { await billingStore.endTrialEarly() } },
                secondaryTitle: "Manage billing",
                secondaryAction: {
                    billingStore.isUpgradeConfirmationPresented = false
                    billingStore.openSettings()
                },
                onDismiss: { billingStore.isUpgradeConfirmationPresented = false }
            )
        }
    }
}

public struct BillingCancelConfirmationSheet: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore
    public let periodEndLabel: String
    public let isTrialing: Bool

    public init(billingStore: BillingStore, periodEndLabel: String, isTrialing: Bool) {
        self.billingStore = billingStore
        self.periodEndLabel = periodEndLabel
        self.isTrialing = isTrialing
    }

    public var body: some View {
        if billingStore.isCancelConfirmationPresented {
            let message = isTrialing
                ? "You keep access until the trial ends on \(periodEndLabel). You can resume any time before then."
                : "Your plan stays active until \(periodEndLabel). You can resume any time before then."
            BillingDialogPanel(
                title: "Cancel your plan?",
                message: message,
                primaryTitle: billingStore.isSubmitting ? "Canceling…" : "Cancel subscription",
                primaryDestructive: true,
                primaryAction: { Task { await billingStore.cancelSubscriptionAtPeriodEnd() } },
                secondaryTitle: "Keep plan",
                secondaryAction: { billingStore.isCancelConfirmationPresented = false },
                onDismiss: { billingStore.isCancelConfirmationPresented = false }
            )
        }
    }
}

private struct BillingDialogPanel: View {
    @Environment(\.nativeWebTheme) private var theme
    let title: String
    let message: String
    let primaryTitle: String
    let primaryDestructive: Bool
    let primaryAction: () -> Void
    let secondaryTitle: String
    let secondaryAction: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            theme.overlayBackdropColor.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.custom("Rubik", size: 18))
                    .foregroundStyle(theme.textColor)
                Text(message)
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textMutedColor)
                HStack(spacing: 8) {
                    Button(primaryTitle, action: primaryAction)
                        .buttonStyle(.plain)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(primaryDestructive ? theme.warningColor : theme.textColor)
                        .foregroundStyle(theme.backgroundColor)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Button(secondaryTitle, action: secondaryAction)
                        .buttonStyle(.plain)
                        .foregroundStyle(theme.textMutedColor)
                }
            }
            .padding(20)
            .frame(maxWidth: 440)
            .background(theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}
