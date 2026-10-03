import CompassData
import CompassKit
import SwiftUI

struct ForgotPasswordFormView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var authStore: AuthStore
    @State private var email = ""
    @State private var touchedEmail = false
    @State private var submitted = false
    @State private var localError: String?

    var body: some View {
        VStack(spacing: 16) {
            if submitted {
                VStack(spacing: 12) {
                    Text("Check your email")
                        .font(.custom("Rubik", size: 16, relativeTo: .headline))
                        .foregroundStyle(theme.textColor)
                    Text(
                        "If an account exists for \(AuthFormValidation.normalizedEmail(email)), you will receive a password reset link shortly."
                    )
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textMutedColor)
                    .multilineTextAlignment(.center)
                    AuthPrimaryButton(title: "Back to sign in", disabled: false, isLoading: false) {
                        authStore.setView(.login)
                    }
                }
            } else {
                Text(
                    "Enter your email address and we'll send you a link to reset your password."
                )
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.textMutedColor)
                .multilineTextAlignment(.center)

                AuthInputField(
                    title: "Email",
                    text: $email,
                    error: touchedEmail ? AuthFormValidation.validateEmail(email) : nil)

                if let localError {
                    Text(localError)
                        .font(.custom("Rubik", size: 13))
                        .foregroundStyle(theme.errorColor)
                        .multilineTextAlignment(.center)
                }

                AuthPrimaryButton(
                    title: "Send reset link",
                    disabled: !AuthFormValidation.forgotPasswordIsValid(email: email),
                    isLoading: authStore.isSubmitting
                ) {
                    touchedEmail = true
                    Task {
                        do {
                            try await authStore.sendForgotPassword(email: email)
                            submitted = true
                            localError = nil
                        } catch let error as AuthStoreError {
                            localError = error.message
                        } catch {
                            localError = error.localizedDescription
                        }
                    }
                }

                AuthLinkButton(title: "Back to sign in") {
                    authStore.setView(.login)
                }
            }
        }
        .onChange(of: email) { _, _ in touchedEmail = true }
    }
}
