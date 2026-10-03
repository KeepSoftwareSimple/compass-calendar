import Foundation

public struct OAuthPublicClients: Sendable, Equatable {
    public let googleClientId: String?
    public let microsoftClientId: String?
    public let appleServicesId: String?

    public init(
        googleClientId: String?,
        microsoftClientId: String?,
        appleServicesId: String?
    ) {
        self.googleClientId = googleClientId
        self.microsoftClientId = microsoftClientId
        self.appleServicesId = appleServicesId
    }

    public init(oauth: AppConfigOauth?) {
        googleClientId = oauth?.googleClientId
        microsoftClientId = oauth?.microsoftClientId
        appleServicesId = oauth?.appleServicesId
    }
}

public enum ProviderSignInURLBuilder {
    private static let googleScopes = [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
    ]
    private static let microsoftScopes = [
        "openid",
        "profile",
        "email",
        "offline_access",
        "User.Read",
        "Calendars.ReadWrite",
    ]

    public static func providerAuthCallbackURL(appURL: URL, provider: String) -> URL {
        var components = URLComponents(url: appURL, resolvingAgainstBaseURL: false)!
        var path = components.path
        if path.hasSuffix("/") { path.removeLast() }
        components.path = path + "/auth/\(provider)/callback"
        components.query = nil
        components.fragment = nil
        return components.url!
    }

    public static func buildGoogleAuthorizationURL(
        appURL: URL,
        clients: OAuthPublicClients,
        state: String
    ) -> URL? {
        guard let clientId = clients.googleClientId, !clientId.isEmpty else { return nil }
        let redirectUri = providerAuthCallbackURL(appURL: appURL, provider: "google").absoluteString
        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: googleScopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
        ]
        return components.url
    }

    public static func buildMicrosoftAuthorizationURL(
        appURL: URL,
        clients: OAuthPublicClients,
        state: String
    ) -> URL? {
        guard let clientId = clients.microsoftClientId, !clientId.isEmpty else { return nil }
        let redirectUri = providerAuthCallbackURL(appURL: appURL, provider: "microsoft").absoluteString
        var components = URLComponents(
            string: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "response_mode", value: "query"),
            URLQueryItem(name: "scope", value: microsoftScopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
        ]
        return components.url
    }

    public static func encodeAppleOAuthState(frontendRedirectURI: String) -> String {
        let payload: [String: String] = ["frontendRedirectURI": frontendRedirectURI]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else {
            return ""
        }
        return data.base64EncodedString()
    }

    public static func buildAppleAuthorizationURL(
        appURL: URL,
        apiBaseURL: URL,
        clients: OAuthPublicClients
    ) -> URL? {
        guard let clientId = clients.appleServicesId, !clientId.isEmpty else { return nil }
        var spaComponents = URLComponents(
            url: providerAuthCallbackURL(appURL: appURL, provider: "apple"),
            resolvingAgainstBaseURL: false)!
        spaComponents.queryItems = [URLQueryItem(name: "desktop", value: "1")]
        let frontendRedirect = spaComponents.url!.absoluteString
        let state = encodeAppleOAuthState(frontendRedirectURI: frontendRedirect)
        guard !state.isEmpty else { return nil }
        let redirectUri = apiBaseURL
            .appendingPathComponent("auth")
            .appendingPathComponent("apple")
            .appendingPathComponent("callback")
            .absoluteString
        var components = URLComponents(string: "https://appleid.apple.com/auth/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "response_mode", value: "form_post"),
            URLQueryItem(name: "scope", value: "name email"),
            URLQueryItem(name: "state", value: state),
        ]
        return components.url
    }
}
