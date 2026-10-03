import CompassData
import SwiftUI

struct StartTrialStepView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var authStore: AuthStore

    var body: some View {
        VStack(spacing: 16) {
            Text(
                "Your card will not be charged until \(authStore.trialChargeDateLabel()). Cancel anytime from Settings and you will not be billed."
            )
            .font(.custom("Rubik", size: 13))
            .foregroundStyle(theme.textMutedColor)
            .multilineTextAlignment(.center)

            AuthPrimaryButton(title: "Continue", disabled: false, isLoading: false) {
                authStore.closeModal()
            }
        }
    }
}
