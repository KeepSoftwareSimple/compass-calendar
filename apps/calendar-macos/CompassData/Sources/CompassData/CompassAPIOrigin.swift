import CompassKit
import Foundation

public enum CompassAPIOrigin {
    /// REST base URL for the Compass backend (`{app origin}/api`).
    public static func apiBaseURL(appURL: URL = AppHostPreference.productionURL) -> URL {
        var components = URLComponents(url: appURL, resolvingAgainstBaseURL: false)!
        var path = components.path
        if path.hasSuffix("/") {
            path.removeLast()
        }
        components.path = path + "/api"
        return components.url!
    }

    public static func streamURL(appURL: URL = AppHostPreference.productionURL) -> URL {
        apiBaseURL(appURL: appURL).appendingPathComponent("events/stream")
    }
}
