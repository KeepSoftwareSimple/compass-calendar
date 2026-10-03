import CompassData
import SwiftUI

public struct BillingSettingsOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore

    public init(billingStore: BillingStore) {
        self.billingStore = billingStore
    }

    public var body: some View {
        if billingStore.isSettingsPresented {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture { billingStore.closeSettings() }
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text("Settings")
                            .font(.custom("Rubik", size: 20))
                            .foregroundStyle(theme.textColor)
                        Spacer()
                        Button("Close") { billingStore.closeSettings() }
                            .buttonStyle(.plain)
                            .foregroundStyle(theme.textMutedColor)
                    }
                    Text("Billing")
                        .font(.custom("Rubik", size: 15))
                        .foregroundStyle(theme.textColor)
                    BillingPlanSectionView(billingStore: billingStore)
                    Spacer(minLength: 0)
                }
                .padding(24)
                .frame(width: 520, height: 560)
                .background(theme.surfaceColor)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(theme.borderColor))
            }
            .accessibilityIdentifier("compass-native-billing-settings")
        }
    }
}
