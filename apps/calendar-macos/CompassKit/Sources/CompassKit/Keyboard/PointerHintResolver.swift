import Foundation

/// Click target kinds that teach keyboard shortcuts (parity with web pointer intents).
public enum PointerClickTarget: String, Hashable, Sendable, CaseIterable {
    case eventCard = "card-click"
    case timedSlot = "slot-click"
    case allDaySlot = "allday-click"
    case eventDrag = "card-drag"
    case gridScroll = "grid-scroll"
    case swipeNext = "swipe-next"
    case swipePrev = "swipe-prev"
    case hoverHunt = "hover-hunt"
}

/// Maps a click target to the primary shortcut id shown in the grid hint pill.
public enum PointerHintResolver {
    public static func primaryShortcut(for target: PointerClickTarget) -> ShortcutId {
        switch target {
        case .eventCard:
            return .editOpen
        case .timedSlot:
            return .createTypedTime
        case .allDaySlot:
            return .createAllday
        case .eventDrag:
            return .editMoveLater
        case .gridScroll:
            return .navScrollHourDown
        case .swipeNext:
            return .navNext
        case .swipePrev:
            return .navPrevious
        case .hoverHunt:
            return .focusPageJump
        }
    }

    public static func teachingShortcutIds(for target: PointerClickTarget) -> [ShortcutId] {
        switch target {
        case .eventCard:
            return [.editOpen, .focusShiftHold]
        case .timedSlot:
            return [.createTypedTime, .createTimed]
        case .allDaySlot:
            return [.createAllday]
        case .eventDrag:
            return [.editMoveLater, .editMoveHourLater]
        case .gridScroll:
            return [.navScrollHourDown, .navToday]
        case .swipeNext:
            return [.navNext]
        case .swipePrev:
            return [.navPrevious]
        case .hoverHunt:
            return [.focusPageJump]
        }
    }
}
