import Foundation

/// OAuth state marker and `compass://` link shapes for Compass Desktop. Mirrors
/// `packages/core/src/desktop/desktop-oauth-state.util.ts`.
public enum DesktopOAuthState {
    public static let statePrefix = "compass-desktop:"

    public static func buildOAuthStateForDesktop() -> String {
        statePrefix + UUID().uuidString.lowercased()
    }

    public static func hasDesktopOAuthStateMarker(_ state: String) -> Bool {
        state.hasPrefix(statePrefix)
    }

    public static func buildDesktopOAuthRelayUrl(provider: String, search: String) -> String {
        let query = search.hasPrefix("?") ? String(search.dropFirst()) : search
        let base = "compass://auth/\(provider)/callback"
        return query.isEmpty ? base : "\(base)?\(query)"
    }

    public struct ParsedAuthDeepLink: Equatable, Sendable {
        public let provider: String
        public let query: String
    }

    public static func parseDesktopAuthDeepLink(_ url: String) -> ParsedAuthDeepLink? {
        let pattern = "^compass://auth/([^/?#]+)/callback(\\?.*)?$"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(url.startIndex..., in: url)
        guard let match = regex.firstMatch(in: url, range: range),
              match.numberOfRanges > 1,
              let providerRange = Range(match.range(at: 1), in: url)
        else {
            return nil
        }
        let provider = String(url[providerRange])
        guard ProviderEnum(rawValue: provider) != nil else { return nil }
        var query = ""
        if match.numberOfRanges > 2, match.range(at: 2).location != NSNotFound,
           let queryRange = Range(match.range(at: 2), in: url)
        {
            query = String(url[queryRange])
        }
        return ParsedAuthDeepLink(provider: provider, query: query)
    }
}
