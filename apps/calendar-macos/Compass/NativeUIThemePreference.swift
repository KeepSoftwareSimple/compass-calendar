import CompassUI
import Foundation

enum NativeUIThemePreference {
    private static let defaultsKey = "COMPASS_NATIVE_THEME"

    static func load() -> NativeWebTheme {
        guard let raw = UserDefaults.standard.string(forKey: defaultsKey),
              let theme = NativeWebTheme(rawValue: raw)
        else {
            return .lightBeach
        }
        return theme
    }

    static func save(_ theme: NativeWebTheme) {
        UserDefaults.standard.set(theme.rawValue, forKey: defaultsKey)
    }
}
