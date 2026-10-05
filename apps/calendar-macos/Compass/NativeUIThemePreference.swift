import CompassData
import CompassKit
import CompassUI
import Foundation

enum NativeUIThemePreference {
    private static let legacyDefaultsKey = "COMPASS_NATIVE_THEME"

    static func load() -> NativeWebTheme {
        if let stored = CompassDevicePreferences.readTheme() {
            return NativeWebTheme(themeName: stored)
        }
        if let raw = UserDefaults.standard.string(forKey: legacyDefaultsKey),
           let theme = NativeWebTheme(rawValue: raw)
        {
            CompassDevicePreferences.writeTheme(theme.compassThemeName)
            UserDefaults.standard.removeObject(forKey: legacyDefaultsKey)
            return theme
        }
        return .lightBeach
    }

    static func save(_ theme: NativeWebTheme) {
        CompassDevicePreferences.writeTheme(theme.compassThemeName)
    }
}
