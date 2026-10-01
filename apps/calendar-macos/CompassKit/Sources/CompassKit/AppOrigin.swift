import Foundation

/// The web app the window hosts, and which navigations stay inside it.
public enum AppOrigin {
    public static let defaultURL = AppHostPreference.productionURL

    /// The URL to load: a launch argument override wins over the
    /// `COMPASS_APP_URL` Info.plist value, which wins over the default.
    /// Values that are not absolute http(s) URLs are ignored.
    public static func resolve(
        override: String?,
        infoValue: String?,
        defaults: UserDefaults = .standard
    ) -> URL {
        if let override, let url = URL(string: override), isWeb(url), url.host != nil {
            return url
        }
        if defaults.string(forKey: AppHostPreference.userDefaultsKey) != nil {
            return AppHostPreference.load(from: defaults).url
        }
        if let infoValue, let url = URL(string: infoValue), isWeb(url), url.host != nil {
            return url
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
              let hostA = normalizedHost(a), let hostB = normalizedHost(b)
        else { return false }
        return schemeA == schemeB && hostA == hostB && port(a) == port(b)
    }

    /// Host comparison that treats apex and `www` as the same site (production
    /// redirects apex to www; the bridge user script uses the same rule).
    private static func normalizedHost(_ url: URL) -> String? {
        guard var host = url.host?.lowercased() else { return nil }
        if host.hasPrefix("www.") {
            host = String(host.dropFirst(4))
        }
        return host
    }

    public static func isWeb(_ url: URL) -> Bool {
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
