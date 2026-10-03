import CompassData
import CompassKit
import SwiftUI

struct LogInFormView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var authStore: AuthStore
    var statusMessage: String?
    @State private var email = ""
    @State private var password = ""
    @State private var touchedEmail = false
    @State private var touchedPassword = false

    var body: some View {
        VStack(spacing: 16) {
            if let statusMessage {
                Text(statusMessage)
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.successColor)
                    .multilineTextAlignment(.center)
            }

            AuthInputField(
                title: "Email",
                text: $email,
                error: touchedEmail ? AuthFormValidation.validateEmail(email) : nil)
            AuthInputField(
                title: "Password",
                text: $password,
                error: touchedPassword ? AuthFormValidation.validateSignInPassword(password) : nil,
                isSecure: true)

            HStack {
                Spacer()
                AuthLinkButton(title: "Forgot password?") {
                    authStore.setView(.forgotPassword)
                }
            }

            AuthPrimaryButton(
                title: "Log in",
                disabled: !AuthFormValidation.logInIsValid(email: email, password: password),
                isLoading: authStore.isSubmitting
            ) {
                touchedEmail = true
                touchedPassword = true
                Task { await authStore.signIn(email: email, password: password) }
            }
        }
        .onChange(of: email) { _, _ in touchedEmail = true }
        .onChange(of: password) { _, _ in touchedPassword = true }
    }
}
