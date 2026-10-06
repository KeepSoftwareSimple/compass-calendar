import Foundation

public enum CompassThemeName: String, Sendable, Hashable, CaseIterable {
    case lightBeach = "light-beach"
    case darkAbyss = "dark-abyss"

    public static let `default`: CompassThemeName = .lightBeach

    public init(storedValue: String?) {
        if let storedValue, let theme = CompassThemeName(rawValue: storedValue) {
            self = theme
        } else {
            self = .default
        }
    }
}
