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

    public var calendarConnectProvider: ProviderEnum {
        switch self {
        case .google: .google
        case .microsoft: .microsoft
        case .apple: .apple
        }
    }
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
    private let oauthService: OAuthAuthorizationService
    private let analyticsIdentity: AnalyticsIdentityCoordinator
    private let usesFixtureTransport: Bool
    private let userMetadataRepository: UserMetadataRepository?
    private let localEventSync: LocalEventSync?
    private let eventsStore: EventsStore?

    public init(
        apiClient: CompassAPIClient,
        configStore: ConfigStore,
        oauthService: OAuthAuthorizationService,
        analyticsIdentity: AnalyticsIdentityCoordinator,
        usesFixtureTransport: Bool,
        userMetadataRepository: UserMetadataRepository? = nil,
        localEventSync: LocalEventSync? = nil,
        eventsStore: EventsStore? = nil
    ) {
        self.apiClient = apiClient
        emailPassword = AuthEmailPasswordClient(client: apiClient)
        userAPI = UserAPI(client: apiClient)
        self.configStore = configStore
        self.oauthService = oauthService
        self.analyticsIdentity = analyticsIdentity
        self.usesFixtureTransport = usesFixtureTransport
        self.userMetadataRepository = userMetadataRepository
        self.localEventSync = localEventSync
        self.eventsStore = eventsStore
    }

    public func bootstrap(forceDemoSignedIn: Bool = false, deferModalUntilWelcomeCompletes: Bool = false) async {
        submitError = nil
        if forceDemoSignedIn {
            authenticated = true
            isModalPresented = false
            refreshRepositorySource()
            return
        }
        authenticated = (try? await apiClient.currentSession()) != nil
        refreshRepositorySource()
        if authenticated {
            await identifyAnalyticsUser()
            isModalPresented = false
        } else if !deferModalUntilWelcomeCompletes {
            openModal(.login)
        } else {
            isModalPresented = false
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
        guard !usesFixtureTransport else { return }
        Task {
            await runSubmitting {
                let clients = OAuthPublicClients(oauth: configStore.config?.oauth)
                let outcome = await oauthService.startSignIn(provider: kind, oauthClients: clients)
                switch outcome {
                case .completed:
                    try await completeAuthentication(closeAfter: true)
                case .userCancelled:
                    submitError = nil
                case let .failed(message):
                    throw AuthStoreError(message: message)
                }
            }
        }
    }

    public func handleOAuthDeepLink(_ urlString: String) async -> Bool {
        guard let outcome = await oauthService.handleAuthDeepLink(urlString) else {
            return false
        }
        switch outcome {
        case .completed:
            do {
                try await completeAuthentication(closeAfter: true)
                return true
            } catch {
                submitError = error.localizedDescription
                return true
            }
        case .userCancelled:
            return true
        case let .failed(message):
            submitError = message
            return true
        }
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
        if case .success = outcome { return }
        throw AuthStoreError(message: sharedAuthErrorMessage(
            outcome,
            fallback: "Unable to send reset email"))
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
            default:
                submitError = sharedAuthErrorMessage(
                    outcome,
                    fallback: "Unable to reset password")
            }
        }
    }

    public func signOut() async throws {
        try await apiClient.auth.signOut()
        await endSessionAndPromptLogin()
    }

    public func handleSessionExpired() async {
        try? await apiClient.signOutLocally()
        await endSessionAndPromptLogin()
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
        default:
            throw AuthStoreError(message: sharedAuthErrorMessage(outcome, fallback: fallback))
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
        default:
            throw AuthStoreError(message: sharedAuthErrorMessage(
                outcome,
                fallback: "Unable to sign up"))
        }
    }

    /// Field, allow-list, HTTP, and transport errors share copy. Success,
    /// wrong-credentials, and invalid-reset-token stay on the caller so the
    /// trial step and reset-token paths stay distinct.
    private func sharedAuthErrorMessage(
        _ outcome: AuthEmailPasswordOutcome,
        fallback: String
    ) -> String {
        switch outcome {
        case let .fieldError(message), let .notAllowed(message):
            return message
        case let .httpError(_, body):
            return AuthAPIUserFacing.message(from: body, fallback: fallback)
        case let .transport(message):
            return AuthAPIUserFacing.connectionMessage(fallback: fallback, detail: message)
        default:
            return fallback
        }
    }

    private func endSessionAndPromptLogin() async {
        authenticated = false
        refreshRepositorySource()
        openModal(.login)
        await analyticsIdentity.resetIdentity()
        await onSignedOut?()
    }

    private func completeAuthentication(closeAfter: Bool) async throws {
        authenticated = true
        if let userMetadataRepository {
            try? AuthRememberedState.markUserHasAuthenticated(repository: userMetadataRepository)
        }
        if let localEventSync {
            _ = try? await localEventSync.syncLocalEventsToCloud()
        }
        refreshRepositorySource()
        await identifyAnalyticsUser()
        if closeAfter {
            closeModal()
        }
        await onAuthenticated?()
    }

    private func refreshRepositorySource() {
        guard let userMetadataRepository, let eventsStore else { return }
        let remembered = (try? AuthRememberedState.hasUserEverAuthenticated(
            repository: userMetadataRepository)) ?? false
        eventsStore.setSource(
            EventRepositorySelection.source(
                sessionExists: authenticated,
                hasUserEverAuthenticated: remembered))
    }

    private func identifyAnalyticsUser() async {
        guard authenticated else { return }
        do {
            let profile = try await userAPI.profile()
            await analyticsIdentity.identify(userId: profile.userId)
            await analyticsIdentity.trackLoginCompleted()
        } catch {}
    }
}

public struct AuthStoreError: Error {
    public let message: String

    init(message: String) {
        self.message = message
    }
}
