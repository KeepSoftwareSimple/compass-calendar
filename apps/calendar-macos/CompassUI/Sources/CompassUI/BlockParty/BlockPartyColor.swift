import CompassKit
import SwiftUI

enum BlockPartyColor {
    static func swiftUIColor(for slot: EventColorSlot?, theme: NativeWebTheme) -> Color {
        guard let slot else { return theme.borderColor }
        switch slot {
        case .blue: return Color(red: 0.2, green: 0.45, blue: 0.95)
        case .coral: return Color(red: 0.95, green: 0.45, blue: 0.4)
        case .gold: return Color(red: 0.9, green: 0.75, blue: 0.2)
        case .green: return Color(red: 0.3, green: 0.7, blue: 0.4)
        case .indigo: return Color(red: 0.35, green: 0.35, blue: 0.85)
        case .lavender: return Color(red: 0.65, green: 0.55, blue: 0.95)
        case .mint: return Color(red: 0.45, green: 0.85, blue: 0.75)
        case .orange: return Color(red: 0.95, green: 0.55, blue: 0.2)
        case .plum: return Color(red: 0.55, green: 0.3, blue: 0.55)
        case .red: return Color(red: 0.9, green: 0.25, blue: 0.25)
        case .slate: return Color(red: 0.45, green: 0.5, blue: 0.55)
        }
    }

    static func slot(from raw: String?) -> EventColorSlot? {
        guard let raw else { return nil }
        return EventColorSlot(rawValue: raw)
    }
}
