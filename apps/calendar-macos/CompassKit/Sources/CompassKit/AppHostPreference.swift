import Foundation

/// Which Compass web origin the desktop shell loads. Persisted for QA staging
/// switches (docs/features/desktop-client.md).
public enum AppHostPreference: String, Equatable, Sendable {
    case production
    case staging

    public static let userDefaultsKey = "compassAppHostPreference"

    public static let productionURL = URL(string: "https://compasscalendar.com")!
    public static let stagingURL = URL(string: "https://staging.compasscalendar.com")!

    public var url: URL {
        switch self {
        case .production: AppHostPreference.productionURL
        case .staging: AppHostPreference.stagingURL
        }
    }

    public static func load(from defaults: UserDefaults = .standard) -> AppHostPreference {
        guard let raw = defaults.string(forKey: userDefaultsKey),
              let value = AppHostPreference(rawValue: raw)
        else {
            return .production
        }
        return value
    }

    public func save(to defaults: UserDefaults = .standard) {
        defaults.set(rawValue, forKey: Self.userDefaultsKey)
    }
}
