import CompassKit
import SwiftUI

extension ThemeTokenColor {
    var swiftUIColor: Color {
        Color(red: red, green: green, blue: blue, opacity: alpha)
    }
}

private protocol NativeThemePalette {
    var background: ThemeTokenColor { get }
    var surface: ThemeTokenColor { get }
    var surfacePanel: ThemeTokenColor { get }
    var text: ThemeTokenColor { get }
    var textMuted: ThemeTokenColor { get }
    var border: ThemeTokenColor { get }
    var accent: ThemeTokenColor { get }
    var accentSecondary: ThemeTokenColor { get }
    var error: ThemeTokenColor { get }
    var success: ThemeTokenColor { get }
    var overlayBackdrop: ThemeTokenColor { get }
}

extension LightBeachPalette: NativeThemePalette {}
extension DarkAbyssPalette: NativeThemePalette {}

public enum NativeWebTheme: String, Sendable, CaseIterable {
    case lightBeach = "light-beach"
    case darkAbyss = "dark-abyss"

    public var desktopAppearance: DesktopThemeAppearance {
        DesktopThemeAppearance(webTheme: rawValue)
    }

    private var palette: any NativeThemePalette {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach
        case .darkAbyss:
            ThemeTokens.darkAbyss
        }
    }

    public var backgroundColor: Color { palette.background.swiftUIColor }
    public var surfaceColor: Color { palette.surface.swiftUIColor }
    public var surfacePanelColor: Color { palette.surfacePanel.swiftUIColor }
    public var textColor: Color { palette.text.swiftUIColor }
    public var textMutedColor: Color { palette.textMuted.swiftUIColor }
    public var borderColor: Color { palette.border.swiftUIColor }
    public var accentColor: Color { palette.accent.swiftUIColor }
    public var accentSecondaryColor: Color { palette.accentSecondary.swiftUIColor }
    public var errorColor: Color { palette.error.swiftUIColor }
    public var successColor: Color { palette.success.swiftUIColor }
    public var overlayBackdropColor: Color { palette.overlayBackdrop.swiftUIColor }
}
