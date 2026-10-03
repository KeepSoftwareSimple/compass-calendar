import CompassData
import SwiftUI

public struct BillingPastDueBannerView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore

    public init(billingStore: BillingStore) {
        self.billingStore = billingStore
    }

    public var body: some View {
        HStack(spacing: 12) {
            Text("Payment failed. Update your card to keep Compass after this period.")
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.textColor)
            Button("Update card") {
                billingStore.openCheckoutFromPastDueBanner()
            }
            .buttonStyle(.plain)
            .font(.custom("Rubik", size: 13, relativeTo: .body))
            .foregroundStyle(theme.warningColor)
            .underline()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(theme.warningColor.opacity(0.12))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(theme.warningColor.opacity(0.35))
                .frame(height: 1)
        }
        .accessibilityIdentifier("compass-native-billing-past-due-banner")
    }
}
