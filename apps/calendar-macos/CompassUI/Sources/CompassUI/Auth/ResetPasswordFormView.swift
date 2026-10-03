import CompassData
import CompassKit
import SwiftUI

struct ResetPasswordFormView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var authStore: AuthStore
    @State private var password = ""
    @State private var touchedPassword = false

    var body: some View {
        VStack(spacing: 16) {
            Text("Enter a new password for your account.")
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.textMutedColor)
                .multilineTextAlignment(.center)

            AuthInputField(
                title: "New password",
                text: $password,
                error: touchedPassword ? AuthFormValidation.validatePassword(password) : nil,
                isSecure: true)

            if let submitError = authStore.submitError {
                Text(submitError)
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.errorColor)
                    .multilineTextAlignment(.center)
            }

            AuthPrimaryButton(
                title: "Reset password",
                disabled: !AuthFormValidation.resetPasswordIsValid(password: password),
                isLoading: authStore.isSubmitting
            ) {
                touchedPassword = true
                Task { await authStore.resetPassword(password: password) }
            }

            AuthLinkButton(title: "Back to forgot password") {
                authStore.setView(.forgotPassword)
            }
        }
        .onChange(of: password) { _, _ in touchedPassword = true }
    }
}
