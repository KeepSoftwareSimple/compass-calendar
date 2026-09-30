import Foundation

/// The web app the window hosts, and which navigations stay inside it.
public enum AppOrigin {
    public static let defaultURL = URL(string: "https://staging.compasscalendar.com")!

    /// The URL to load: a launch argument override wins over the
    /// `COMPASS_APP_URL` Info.plist value, which wins over the default.
    /// Values that are not absolute http(s) URLs are ignored.
    public static func resolve(override: String?, infoValue: String?) -> URL {
        for candidate in [override, infoValue] {
            if let candidate, let url = URL(string: candidate), isWeb(url), url.host != nil {
                return url
            }
        }
        return defaultURL
    }

    public enum Decision: Equatable {
        case allow
        case openExternally
    }

    /// Main-frame navigations stay in the window only on the app origin
    /// (scheme, host, and port). Everything else opens in the default
    /// browser. Subframes (payment and captcha iframes) load in place.
    public static func decide(_ url: URL, isMainFrame: Bool, appURL: URL) -> Decision {
        guard isMainFrame else { return .allow }
        if url.scheme == "about" { return .allow }
        return isSameOrigin(url, appURL) ? .allow : .openExternally
    }

    public static func isSameOrigin(_ a: URL, _ b: URL) -> Bool {
        guard let schemeA = a.scheme?.lowercased(), let schemeB = b.scheme?.lowercased(),
              let hostA = a.host?.lowercased(), let hostB = b.host?.lowercased()
        else { return false }
        return schemeA == schemeB && hostA == hostB && port(a) == port(b)
    }

    private static func isWeb(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased()
        return scheme == "https" || scheme == "http"
    }

    private static func port(_ url: URL) -> Int? {
        if let port = url.port { return port }
        switch url.scheme?.lowercased() {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }
}
