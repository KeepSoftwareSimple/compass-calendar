import SwiftUI

private struct NativeWebThemeKey: EnvironmentKey {
    static let defaultValue: NativeWebTheme = .lightBeach
}

extension EnvironmentValues {
    public var nativeWebTheme: NativeWebTheme {
        get { self[NativeWebThemeKey.self] }
        set { self[NativeWebThemeKey.self] = newValue }
    }
}
