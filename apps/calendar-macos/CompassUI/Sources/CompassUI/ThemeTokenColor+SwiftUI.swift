import CompassKit
import SwiftUI

extension ThemeTokenColor {
    var swiftUIColor: Color {
        Color(red: red, green: green, blue: blue, opacity: alpha)
    }
}

public enum NativeWebTheme: String, Sendable, CaseIterable {
    case lightBeach = "light-beach"
    case darkAbyss = "dark-abyss"

    public var desktopAppearance: DesktopThemeAppearance {
        DesktopThemeAppearance(webTheme: rawValue)
    }

    public var backgroundColor: Color {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach.background.swiftUIColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.background.swiftUIColor
        }
    }

    public var surfaceColor: Color {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach.surface.swiftUIColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.surface.swiftUIColor
        }
    }

    public var surfacePanelColor: Color {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach.surfacePanel.swiftUIColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.surfacePanel.swiftUIColor
        }
    }

    public var textColor: Color {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach.text.swiftUIColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.text.swiftUIColor
        }
    }

    public var textMutedColor: Color {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach.textMuted.swiftUIColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.textMuted.swiftUIColor
        }
    }

    public var borderColor: Color {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach.border.swiftUIColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.border.swiftUIColor
        }
    }

    public var accentColor: Color {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach.accent.swiftUIColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.accent.swiftUIColor
        }
    }

    public var accentSecondaryColor: Color {
        switch self {
        case .lightBeach:
            ThemeTokens.lightBeach.accentSecondary.swiftUIColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.accentSecondary.swiftUIColor
        }
    }
}
