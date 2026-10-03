import Foundation

public struct PointerHintAttempt: Hashable, Sendable {
    public var message: String
    public var keycapGroups: [[String]]

    public init(message: String, keycapGroups: [[String]]) {
        self.message = message
        self.keycapGroups = keycapGroups
    }
}

public enum PointerHintMessaging {
    public static func attempt(for target: PointerClickTarget, registry: ShortcutRegistry) -> PointerHintAttempt? {
        let shortcutIds = PointerHintResolver.teachingShortcutIds(for: target)
        guard !shortcutIds.isEmpty else { return nil }

        let keycapGroups = shortcutIds.compactMap { id -> [String]? in
            registry.entries.first(where: { $0.id == id })?.displayKeycaps
        }
        guard keycapGroups.count == shortcutIds.count else { return nil }

        let template: String = switch target {
        case .eventCard:
            "Press {0} to open. Hold {1} to jump to any event."
        case .timedSlot:
            "Type a time for that slot, or press {1}."
        case .allDaySlot:
            "Press {0} for an all-day event."
        case .eventDrag:
            "{0} moves 15 min. {1} moves an hour."
        case .gridScroll:
            "{0} scrolls an hour. {1} jumps to now."
        case .swipeNext, .swipePrev:
            "Next time, press {0}."
        case .hoverHunt:
            "Hold Mod to see where you can jump."
        }

        return PointerHintAttempt(message: template, keycapGroups: keycapGroups)
    }
}
