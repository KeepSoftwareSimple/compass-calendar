// Mirrors web auth modal + session bootstrap (`useAuthFormHandlers`, `useAuthModal`, session context).

import CompassKit
import Foundation

public enum AuthView: String, Sendable, CaseIterable {
    case login
    case loginAfterReset
    case signUp
    case startTrial
    case forgotPassword
    case resetPassword
}

public enum SignInProviderKind: String, Sendable, CaseIterable {
    case google
    case microsoft
    case apple
}

@MainActor
@Observable
public final class AuthStore {
    public private(set) var authenticated = false
    public private(set) var isModalPresented = false
    public private(set) var currentView: AuthView = .login
    public private(set) var isSubmitting = false
    public private(set) var submitError: String?
    public private(set) var resetPasswordToken: String?
    public private(set) var signUpDisplayName = ""

    public func updateSignUpDisplayName(_ name: String) {
        signUpDisplayName = AuthFormValidation.trimmedName(name)
    }

    public var onAuthenticated: (() async -> Void)?
    public var onSignedOut: (() async -> Void)?

    private let apiClient: CompassAPIClient
    private let emailPassword: AuthEmailPasswordClient
    private let userAPI: UserAPI
    private let configStore: ConfigStore
    private let analyticsIdentity: AnalyticsIdentityCoordinator
    private let usesFixtureTransport: Bool

    public init(
        apiClient: CompassAPIClient,
        configStore: ConfigStore,
        analyticsIdentity: AnalyticsIdentityCoordinator,
        usesFixtureTransport: Bool
    ) {
        self.apiClient = apiClient
        emailPassword = AuthEmailPasswordClient(client: apiClient)
        userAPI = UserAPI(client: apiClient)
        self.configStore = configStore
        self.analyticsIdentity = analyticsIdentity
        self.usesFixtureTransport = usesFixtureTransport
    }

    public func bootstrap(forceDemoSignedIn: Bool) async {
        submitError = nil
        if forceDemoSignedIn {
            authenticated = true
            isModalPresented = false
            return
        }
        authenticated = (try? await apiClient.currentSession()) != nil
        if authenticated {
            await identifyAnalyticsUser()
            isModalPresented = false
        } else {
            openModal(.login)
        }
    }

    public func availableSignInProviders() -> [SignInProviderKind] {
        guard let providers = configStore.config?.providers else { return [] }
        var kinds: [SignInProviderKind] = []
        if providers.google.signIn { kinds.append(.google) }
        if providers.microsoft.signIn { kinds.append(.microsoft) }
        if providers.apple.signIn { kinds.append(.apple) }
        return kinds
    }

    public func openModal(_ view: AuthView = .login) {
        currentView = view
        isModalPresented = true
        submitError = nil
    }

    public func closeModal() {
        isModalPresented = false
        submitError = nil
        if authenticated, currentView == .startTrial {
            currentView = .login
        }
    }

    public func setView(_ view: AuthView) {
        currentView = view
        submitError = nil
    }

    public func presentResetPassword(token: String) {
        resetPasswordToken = token
        openModal(.resetPassword)
    }

    public func signInWithProvider(_ kind: SignInProviderKind) {
        _ = kind
        // OAuth work package wires ASWebAuthenticationSession.
    }

    public func signIn(email: String, password: String) async {
        await runSubmitting {
            let outcome = await emailPassword.signIn(
                email: AuthFormValidation.normalizedEmail(email),
                password: password)
            try await handleSignInOutcome(outcome, fallback: "Unable to log in")
        }
    }

    public func signUp(name: String, email: String, password: String) async {
        await runSubmitting {
            let outcome = await emailPassword.signUp(
                name: AuthFormValidation.trimmedName(name),
                email: AuthFormValidation.normalizedEmail(email),
                password: password)
            try await handleSignUpOutcome(outcome)
        }
    }

    public func sendForgotPassword(email: String) async throws {
        isSubmitting = true
        defer { isSubmitting = false }
        let outcome = await emailPassword.sendPasswordResetEmail(
            email: AuthFormValidation.normalizedEmail(email))
        if case let .fieldError(message) = outcome {
            throw AuthStoreError(message: message)
        }
        if case let .notAllowed(message) = outcome {
            throw AuthStoreError(message: message)
        }
        if case let .httpError(_, body) = outcome {
            throw AuthStoreError(message: 
                AuthStore.userFacingMessage(from: body, fallback: "Unable to send reset email"))
        }
        if case let .transport(message) = outcome {
            throw AuthStoreError(message: 
                AuthStore.connectionMessage(fallback: "Unable to send reset email", detail: message))
        }
        guard case .success = outcome else {
            throw AuthStoreError(message: "Unable to send reset email")
        }
    }

    public func resetPassword(password: String) async {
        guard let token = resetPasswordToken else {
            submitError = "This reset link is invalid or expired. Request a new one."
            return
        }
        await runSubmitting {
            let outcome = await emailPassword.resetPassword(token: token, password: password)
            switch outcome {
            case .success:
                resetPasswordToken = nil
                currentView = .loginAfterReset
                submitError = nil
            case .invalidResetToken:
                submitError = "This reset link is invalid or expired. Request a new one."
            case let .fieldError(message):
                submitError = message
            case let .notAllowed(message):
                submitError = message
            case let .httpError(_, body):
                submitError = AuthStore.userFacingMessage(
                    from: body,
                    fallback: "Unable to reset password")
            case let .transport(message):
                submitError = AuthStore.connectionMessage(
                    fallback: "Unable to reset password",
                    detail: message)
            default:
                submitError = "Unable to reset password"
            }
        }
    }

    public func signOut() async throws {
        try await apiClient.auth.signOut()
        authenticated = false
        submitError = nil
        openModal(.login)
        await analyticsIdentity.resetIdentity()
        await onSignedOut?()
    }

    public func handleSessionExpired() async {
        try? await apiClient.signOutLocally()
        authenticated = false
        submitError = "Your session expired. Log in again."
        openModal(.login)
        await analyticsIdentity.resetIdentity()
        await onSignedOut?()
    }

    public func shouldOfferSignupTrialStep() -> Bool {
        guard let config = configStore.config else { return false }
        return config.billing.isConfigured && config.billing.enforcement
    }

    public func trialChargeDateLabel(reference: Date = Date()) -> String {
        let days = Int(configStore.config?.billing.trialLengthDays ?? 7)
        let charge = Calendar.current.date(byAdding: .day, value: days, to: reference) ?? reference
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter.string(from: charge)
    }

    private func runSubmitting(_ work: () async throws -> Void) async {
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }
        do {
            try await work()
        } catch let error as AuthStoreError {
            submitError = error.message
        } catch {
            submitError = error.localizedDescription
        }
    }

    private func handleSignInOutcome(_ outcome: AuthEmailPasswordOutcome, fallback: String) async throws {
        switch outcome {
        case .success:
            try await completeAuthentication(closeAfter: true)
        case .wrongCredentials:
            throw AuthStoreError(message: "Incorrect email or password.")
        case let .fieldError(message):
            throw AuthStoreError(message: message)
        case let .notAllowed(message):
            throw AuthStoreError(message: message)
        case let .httpError(_, body):
            throw AuthStoreError(message: AuthStore.userFacingMessage(from: body, fallback: fallback))
        case let .transport(message):
            throw AuthStoreError(message: 
                AuthStore.connectionMessage(fallback: fallback, detail: message))
        case .missingSession:
            throw AuthStoreError(message: fallback)
        default:
            throw AuthStoreError(message: fallback)
        }
    }

    private func handleSignUpOutcome(_ outcome: AuthEmailPasswordOutcome) async throws {
        switch outcome {
        case .success:
            if shouldOfferSignupTrialStep() {
                try await completeAuthentication(closeAfter: false)
                currentView = .startTrial
            } else {
                try await completeAuthentication(closeAfter: true)
            }
        case let .fieldError(message):
            throw AuthStoreError(message: message)
        case let .notAllowed(message):
            throw AuthStoreError(message: message)
        case let .httpError(_, body):
            throw AuthStoreError(message: 
                AuthStore.userFacingMessage(from: body, fallback: "Unable to sign up"))
        case let .transport(message):
            throw AuthStoreError(message: 
                AuthStore.connectionMessage(fallback: "Unable to sign up", detail: message))
        default:
            throw AuthStoreError(message: "Unable to sign up")
        }
    }

    private func completeAuthentication(closeAfter: Bool) async throws {
        authenticated = true
        await identifyAnalyticsUser()
        if closeAfter {
            closeModal()
        }
        await onAuthenticated?()
    }

    private func identifyAnalyticsUser() async {
        guard authenticated else { return }
        do {
            let profile = try await userAPI.profile()
            await analyticsIdentity.identify(userId: profile.userId)
            await analyticsIdentity.trackLoginCompleted()
        } catch {}
    }

    static func userFacingMessage(from body: String, fallback: String) -> String {
        guard let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return fallback
        }
        if let status = json["status"] as? String, status == "WRONG_CREDENTIALS_ERROR" {
            return "Incorrect email or password."
        }
        if let fields = json["formFields"] as? [[String: Any]],
           let first = fields.first,
           let message = first["error"] as? String
        {
            return message
        }
        if let reason = json["reason"] as? String {
            return reason
        }
        return fallback
    }

    static func connectionMessage(fallback: String, detail: String) -> String {
        if detail.localizedCaseInsensitiveContains("offline")
            || detail.localizedCaseInsensitiveContains("network")
            || detail.localizedCaseInsensitiveContains("internet")
        {
            return "We can't reach Compass right now. Please check your connection and try again."
        }
        return fallback
    }
}

public struct AuthStoreError: Error {
    public let message: String

    init(message: String) {
        self.message = message
    }
}
