import CompassData
import CompassKit
import SwiftUI

struct SignUpFormView: View {
    @Bindable var authStore: AuthStore
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var touchedName = false
    @State private var touchedEmail = false
    @State private var touchedPassword = false

    var body: some View {
        VStack(spacing: 16) {
            AuthInputField(
                title: "Name",
                text: $name,
                error: touchedName ? AuthFormValidation.validateName(name) : nil)
            AuthInputField(
                title: "Email",
                text: $email,
                error: touchedEmail ? AuthFormValidation.validateEmail(email) : nil)
            AuthInputField(
                title: "Password",
                text: $password,
                error: touchedPassword ? AuthFormValidation.validatePassword(password) : nil,
                isSecure: true)

            AuthPrimaryButton(
                title: "Sign up",
                disabled: !AuthFormValidation.signUpIsValid(name: name, email: email, password: password),
                isLoading: authStore.isSubmitting
            ) {
                touchedName = true
                touchedEmail = true
                touchedPassword = true
                authStore.updateSignUpDisplayName(name)
                Task { await authStore.signUp(name: name, email: email, password: password) }
            }
        }
        .onChange(of: name) { _, value in
            touchedName = true
            authStore.updateSignUpDisplayName(value)
        }
        .onChange(of: email) { _, _ in touchedEmail = true }
        .onChange(of: password) { _, _ in touchedPassword = true }
    }
}
