import Foundation

/// Layer `name` values on `EventCardView` for tests and debugging.
public enum EventCardChromeLayerName {
    public static let focusRing = "compass-event-focus-ring"
    public static let edgeFocus = "compass-event-edge-focus"
    public static let edgeGutter = "compass-event-edge-gutter"
}

/// Web `resolveEventFocusIndicatorColor` and related contrast helpers.
public enum GridEventFocusChrome {
    public static let minIndicatorContrast: Double = 3

    public static func resolveIndicatorHex(
        focusHex: String?,
        fillHex: String,
        theme: CompassThemeName
    ) -> String {
        if let focusHex,
            contrastRatio(focusHex, fillHex) >= minIndicatorContrast
        {
            return focusHex
        }
        return contrastTextHex(on: fillHex, theme: theme)
    }

    public static func contrastTextHex(on fillHex: String, theme: CompassThemeName) -> String {
        let palette = theme.palette
        let candidates: [String] = switch theme {
        case .lightBeach:
            [palette.textHex, palette.onAccentHex]
        case .darkAbyss:
            [palette.onAccentHex, palette.textHex]
        }
        let fillLum = relativeLuminance(fillHex)
        func contrast(_ textHex: String) -> Double {
            let textLum = relativeLuminance(textHex)
            return (max(textLum, fillLum) + 0.05) / (min(textLum, fillLum) + 0.05)
        }
        return contrast(candidates[0]) >= contrast(candidates[1]) ? candidates[0] : candidates[1]
    }

    public static func contrastRatio(_ a: String, _ b: String) -> Double {
        let aLum = relativeLuminance(a)
        let bLum = relativeLuminance(b)
        return (max(aLum, bLum) + 0.05) / (min(aLum, bLum) + 0.05)
    }

    public static func relativeLuminance(_ hex: String) -> Double {
        guard let rgb = parseHex(hex) else { return 0 }
        func linear(_ channel: Double) -> Double {
            channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(rgb.red)
            + 0.7152 * linear(rgb.green)
            + 0.0722 * linear(rgb.blue)
    }

    private struct RGB {
        let red: Double
        let green: Double
        let blue: Double
    }

    private static func parseHex(_ hex: String) -> RGB? {
        var normalized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.hasPrefix("#") { normalized.removeFirst() }
        guard normalized.count == 6, let value = UInt64(normalized, radix: 16) else { return nil }
        return RGB(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

private extension CompassThemeName {
    struct PaletteHex {
        let textHex: String
        let onAccentHex: String
        let backgroundHex: String
    }

    var palette: PaletteHex {
        switch self {
        case .lightBeach:
            PaletteHex(
                textHex: ThemeTokens.lightBeach.text.hexString,
                onAccentHex: ThemeTokens.lightBeach.onAccent.hexString,
                backgroundHex: ThemeTokens.lightBeach.background.hexString
            )
        case .darkAbyss:
            PaletteHex(
                textHex: ThemeTokens.darkAbyss.text.hexString,
                onAccentHex: ThemeTokens.darkAbyss.onAccent.hexString,
                backgroundHex: ThemeTokens.darkAbyss.background.hexString
            )
        }
    }
}

private extension ThemeTokenColor {
    var hexString: String {
        String(
            format: "#%02X%02X%02X",
            Int((red * 255).rounded()),
            Int((green * 255).rounded()),
            Int((blue * 255).rounded())
        )
    }
}
