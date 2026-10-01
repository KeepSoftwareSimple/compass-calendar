import AppKit
import CompassKit

enum CompassAppearance {
    static func apply(theme: DesktopAppearanceTheme) {
        switch theme {
        case .darkAbyss:
            NSApp.appearance = NSAppearance(named: .darkAqua)
        case .lightBeach:
            NSApp.appearance = NSAppearance(named: .aqua)
        }
    }
}
