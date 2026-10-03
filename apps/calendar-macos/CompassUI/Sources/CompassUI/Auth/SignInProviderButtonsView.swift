import CompassData
import SwiftUI

struct SignInProviderButtonsView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var authStore: AuthStore

    var body: some View {
        VStack(spacing: 10) {
            ForEach(authStore.availableSignInProviders(), id: \.self) { kind in
                AuthPrimaryButton(
                    title: label(for: kind),
                    disabled: authStore.isSubmitting,
                    isLoading: authStore.isSubmitting)
                {
                    authStore.signInWithProvider(kind)
                }
            }
        }
    }

    private func label(for kind: SignInProviderKind) -> String {
        switch kind {
        case .google:
            "Continue with Google"
        case .microsoft:
            "Continue with Microsoft"
        case .apple:
            "Continue with Apple"
        }
    }
}
