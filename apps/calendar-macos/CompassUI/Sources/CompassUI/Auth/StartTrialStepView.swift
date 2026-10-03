import CompassData
import SwiftUI

struct StartTrialStepView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var authStore: AuthStore
    @Bindable var billingStore: BillingStore

    var body: some View {
        VStack(spacing: 16) {
            Text(
                "Your card will not be charged until \(authStore.trialChargeDateLabel()). Cancel anytime from Settings and you will not be billed."
            )
            .font(.custom("Rubik", size: 13))
            .foregroundStyle(theme.textMutedColor)
            .multilineTextAlignment(.center)

            AuthPrimaryButton(
                title: billingStore.isOpeningHostedSession ? "Opening checkout…" : "Add card",
                disabled: billingStore.isOpeningHostedSession,
                isLoading: billingStore.isOpeningHostedSession
            ) {
                Task {
                    await billingStore.openHostedCheckout()
                    authStore.closeModal()
                }
            }
        }
        .onAppear {
            Task { await billingStore.refreshStatus() }
        }
    }
}
