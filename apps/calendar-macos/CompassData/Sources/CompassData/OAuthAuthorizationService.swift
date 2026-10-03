import CompassKit
import Foundation

public enum OAuthAuthorizationOutcome: Sendable {
    case completed
    case userCancelled
    case failed(message: String)
}

@MainActor
public final class OAuthAuthorizationService {
    private let apiClient: CompassAPIClient
    private let appURL: URL
    private let authAPI: AuthAPI
    private let connectionsAPI: ConnectionsAPI
    private weak var webAuthPresenter: WebAuthSessionPresenting?

    public init(
        apiClient: CompassAPIClient,
        appURL: URL = AppHostPreference.productionURL,
        webAuthPresenter: WebAuthSessionPresenting?
    ) {
        self.apiClient = apiClient
        self.appURL = appURL
        authAPI = AuthAPI(client: apiClient)
        connectionsAPI = ConnectionsAPI(client: apiClient)
        self.webAuthPresenter = webAuthPresenter
    }

    public func setWebAuthPresenter(_ presenter: WebAuthSessionPresenting?) {
        webAuthPresenter = presenter
    }

    public func startSignIn(
        provider: SignInProviderKind,
        oauthClients: OAuthPublicClients
    ) async -> OAuthAuthorizationOutcome {
        guard let presenter = webAuthPresenter else {
            return .failed(message: "Sign in is unavailable in this build.")
        }
        let providerId = provider.rawValue
        let state = DesktopOAuthState.buildOAuthStateForDesktop()
        let apiBase = CompassAPIOrigin.apiBaseURL(appURL: appURL)
        guard let url = authorizationURL(
            for: provider,
            oauthClients: oauthClients,
            state: state,
            apiBaseURL: apiBase)
        else {
            return .failed(message: "This sign-in method is not configured.")
        }
        do {
            let callbackURL = try await presenter.present(
                url: url,
                callbackURLScheme: "compass")
            return await finishAuthCallback(callbackURL: callbackURL, expectedProvider: providerId)
        } catch WebAuthSessionError.userCancelled {
            return .userCancelled
        } catch {
            return .failed(message: "We couldn't finish signing you in. Please try again.")
        }
    }

    public func startConnection(
        provider: ProviderEnum,
        connectionId: ConnectionId?,
        oauthClients: OAuthPublicClients
    ) async -> OAuthAuthorizationOutcome {
        guard let presenter = webAuthPresenter else {
            return .failed(message: "Connect is unavailable in this build.")
        }
        do {
            let begin = try await connectionsAPI.begin(
                ConnectionBeginRequest(
                    connectionId: connectionId,
                    desktopRelay: true,
                    features: nil,
                    provider: provider))
            let redirectURL: URL
            switch begin {
            case let .redirect(url):
                redirectURL = url
            case .connected:
                return .completed
            }
            let callbackURL = try await presenter.present(
                url: redirectURL,
                callbackURLScheme: "compass")
            if callbackURL.absoluteString.contains("compass://connect/") {
                return await handleConnectDeepLink(callbackURL.absoluteString)
            }
            return await finishAuthCallback(
                callbackURL: callbackURL,
                expectedProvider: provider.rawValue)
        } catch WebAuthSessionError.userCancelled {
            return .userCancelled
        } catch {
            return .failed(message: "We couldn't connect your calendar. Please try again.")
        }
    }

    public func connectAppleCredential(username: String, secret: String) async throws {
        _ = try await connectionsAPI.connectCredential(
            ConnectionCredentialBrowserRequest(
                provider: "apple",
                secret: secret,
                username: username))
    }

    public func refreshConnections() async throws -> ConnectionRefreshResponse {
        try await connectionsAPI.refresh()
    }

    public func disconnect(connectionId: ConnectionId) async throws {
        try await connectionsAPI.disconnect(connectionId: connectionId)
    }

    public func handleAuthDeepLink(_ urlString: String) async -> OAuthAuthorizationOutcome? {
        guard let parsed = DesktopOAuthState.parseDesktopAuthDeepLink(urlString) else {
            return nil
        }
        return await finishAuthCallback(
            callbackURL: URL(string: urlString)!,
            expectedProvider: parsed.provider)
    }

    public func handleConnectDeepLink(_ urlString: String) async -> OAuthAuthorizationOutcome {
        guard let parsed = parseConnectDeepLink(urlString)
        else {
            return .failed(message: "We couldn't finish connecting your calendar.")
        }
        let query = parsed.query.hasPrefix("?") ? String(parsed.query.dropFirst()) : parsed.query
        var components = URLComponents()
        components.query = query
        let status = components.queryItems?.first { $0.name == "status" }?.value
        if status == "connected" {
            return .completed
        }
        return .failed(message: "We couldn't finish connecting your calendar.")
    }

    private func parseConnectDeepLink(_ url: String) -> (provider: String, query: String)? {
        let pattern = "^compass://connect/([^/?#]+)/callback(\\?.*)?$"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(url.startIndex..., in: url)
        guard let match = regex.firstMatch(in: url, range: range),
              match.numberOfRanges > 1,
              let providerRange = Range(match.range(at: 1), in: url)
        else { return nil }
        var query = ""
        if match.numberOfRanges > 2, match.range(at: 2).location != NSNotFound,
           let queryRange = Range(match.range(at: 2), in: url)
        {
            query = String(url[queryRange])
        }
        return (String(url[providerRange]), query)
    }

    private func authorizationURL(
        for provider: SignInProviderKind,
        oauthClients: OAuthPublicClients,
        state: String,
        apiBaseURL: URL
    ) -> URL? {
        switch provider {
        case .google:
            return ProviderSignInURLBuilder.buildGoogleAuthorizationURL(
                appURL: appURL,
                clients: oauthClients,
                state: state)
        case .microsoft:
            return ProviderSignInURLBuilder.buildMicrosoftAuthorizationURL(
                appURL: appURL,
                clients: oauthClients,
                state: state)
        case .apple:
            return ProviderSignInURLBuilder.buildAppleAuthorizationURL(
                appURL: appURL,
                apiBaseURL: apiBaseURL,
                clients: oauthClients)
        }
    }

    private func finishAuthCallback(callbackURL: URL, expectedProvider: String) async
        -> OAuthAuthorizationOutcome
    {
        guard let parsed = DesktopOAuthState.parseDesktopAuthDeepLink(callbackURL.absoluteString),
              parsed.provider == expectedProvider
        else {
            return .failed(message: "We couldn't finish signing you in. Please try again.")
        }
        let query = parsed.query.hasPrefix("?") ? String(parsed.query.dropFirst()) : parsed.query
        var components = URLComponents()
        components.query = query
        let items = components.queryItems ?? []
        func param(_ name: String) -> String? {
            items.first { $0.name == name }?.value
        }
        if param("error") == "access_denied" {
            return .userCancelled
        }
        if let error = param("error"), !error.isEmpty {
            return .failed(message: "We couldn't finish signing you in. Please try again.")
        }
        guard let code = param("code"), !code.isEmpty else {
            return .failed(message: "We couldn't finish signing you in. Please try again.")
        }
        let state = param("state")
        let scope = param("scope")
        let user = param("user")
        let redirectURI = ProviderSignInURLBuilder.providerAuthCallbackURL(
            appURL: appURL,
            provider: expectedProvider).absoluteString
        let request = SignInUpRequest(
            thirdPartyId: expectedProvider,
            redirectURIInfo: .init(
                redirectURIOnProviderDashboard: redirectURI,
                redirectURIQueryParams: .init(
                    code: code,
                    scope: scope,
                    state: state,
                    user: user),
                pkceCodeVerifier: nil))
        do {
            try await authAPI.signInUp(request)
            return .completed
        } catch {
            return .failed(message: "We couldn't finish signing you in. Please try again.")
        }
    }
}

@MainActor
public protocol WebAuthSessionPresenting: AnyObject {
    func present(url: URL, callbackURLScheme: String) async throws -> URL
}

public enum WebAuthSessionError: Error, Sendable {
    case userCancelled
    case failed
}
