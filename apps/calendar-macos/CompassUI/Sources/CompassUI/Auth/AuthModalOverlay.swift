import CompassData
import SwiftUI

public struct AuthModalOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var authStore: AuthStore
    @Bindable public var billingStore: BillingStore

    public init(authStore: AuthStore, billingStore: BillingStore) {
        self.authStore = authStore
        self.billingStore = billingStore
    }

    public var body: some View {
        if authStore.isModalPresented {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture { authStore.closeModal() }

                VStack(spacing: 20) {
                    header
                    content
                    footer
                }
                .padding(24)
                .frame(maxWidth: 480)
                .background(theme.surfaceColor)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("compass-native-auth-modal")
            }
            .transition(.opacity)
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.custom("Rubik", size: 20, relativeTo: .title2))
                .foregroundStyle(theme.textColor)
                .multilineTextAlignment(.leading)
            Spacer()
            if showsAuthSwitch {
                Button(action: toggleAuthView) {
                    Text(authStore.currentView == .signUp ? "Log in" : "Sign up")
                        .font(.custom("Rubik", size: 12))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(theme.borderColor.opacity(0.35))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch authStore.currentView {
        case .startTrial:
            StartTrialStepView(authStore: authStore, billingStore: billingStore)
        case .signUp:
            SignUpFormView(authStore: authStore)
        case .login, .loginAfterReset:
            LogInFormView(
                authStore: authStore,
                statusMessage: authStore.currentView == .loginAfterReset
                    ? "Password reset successful. Log in with your new password."
                    : nil)
        case .forgotPassword:
            ForgotPasswordFormView(authStore: authStore)
        case .resetPassword:
            ResetPasswordFormView(authStore: authStore)
        }

        if showsSubmitError, let submitError = authStore.submitError {
            Text(submitError)
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.errorColor)
                .multilineTextAlignment(.center)
        }

        if showsProviders {
            HStack {
                Rectangle().fill(theme.borderColor).frame(height: 1)
                Text("or")
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textMutedColor)
                Rectangle().fill(theme.borderColor).frame(height: 1)
            }
            SignInProviderButtonsView(authStore: authStore)
        }

        if authStore.currentView == .signUp {
            Text("Signing up also gets you occasional product emails. Unsubscribe anytime.")
                .font(.custom("Rubik", size: 11))
                .foregroundStyle(theme.textMutedColor)
                .multilineTextAlignment(.center)
        }
    }

    private var footer: some View {
        VStack(spacing: 8) {
            AuthLinkButton(title: "Back") {
                authStore.closeModal()
            }
            HStack(spacing: 8) {
                footerLink("Pricing", url: "https://compasscalendar.com/pricing")
                Text("·").foregroundStyle(theme.textMutedColor)
                footerLink("Terms", url: "https://www.compasscalendar.com/terms")
                Text("·").foregroundStyle(theme.textMutedColor)
                footerLink("Privacy", url: "https://www.compasscalendar.com/privacy")
            }
            .font(.custom("Rubik", size: 11))
        }
    }

    private var title: String {
        switch authStore.currentView {
        case .startTrial:
            "Start your 7-day free trial"
        case .forgotPassword:
            "Reset Password"
        case .resetPassword:
            "Set New Password"
        case .signUp:
            authStore.signUpDisplayName.isEmpty
                ? "Nice to meet you"
                : "Nice to meet you, \(authStore.signUpDisplayName)"
        case .login, .loginAfterReset:
            "Hey, welcome back"
        }
    }

    private var showsAuthSwitch: Bool {
        authStore.currentView == .login || authStore.currentView == .signUp
    }

    private var showsSubmitError: Bool {
        authStore.currentView == .login
            || authStore.currentView == .loginAfterReset
            || authStore.currentView == .signUp
    }

    private var showsProviders: Bool {
        authStore.currentView != .startTrial
            && authStore.currentView != .resetPassword
            && !authStore.availableSignInProviders().isEmpty
    }

    private func toggleAuthView() {
        authStore.setView(authStore.currentView == .signUp ? .login : .signUp)
    }

    @ViewBuilder
    private func footerLink(_ title: String, url: String) -> some View {
        if let link = URL(string: url) {
            Link(title, destination: link)
                .foregroundStyle(theme.textMutedColor)
        }
    }
}
