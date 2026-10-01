import Foundation

/// Maps web `data-theme` values to native chrome appearance names.
public enum DesktopThemeAppearance: Equatable, Sendable {
    case lightBeach
    case darkAbyss

    public init(webTheme: String) {
        switch webTheme {
        case "dark-abyss":
            self = .darkAbyss
        default:
            self = .lightBeach
        }
    }

    public var nsAppearanceName: String {
        switch self {
        case .lightBeach:
            return "NSAppearanceNameAqua"
        case .darkAbyss:
            return "NSAppearanceNameDarkAqua"
        }
    }
}
