import AppKit
import CompassKit

extension ThemeTokenColor {
    var nsColor: NSColor {
        NSColor(
            red: red,
            green: green,
            blue: blue,
            alpha: alpha
        )
    }
}

enum EventCardColorParser {
    static func nsColor(hex: String?) -> NSColor? {
        guard var hex else { return nil }
        hex = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") {
            hex.removeFirst()
        }
        guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return nil }
        let red = CGFloat((value >> 16) & 0xFF) / 255
        let green = CGFloat((value >> 8) & 0xFF) / 255
        let blue = CGFloat(value & 0xFF) / 255
        return NSColor(red: red, green: green, blue: blue, alpha: 1)
    }
}
