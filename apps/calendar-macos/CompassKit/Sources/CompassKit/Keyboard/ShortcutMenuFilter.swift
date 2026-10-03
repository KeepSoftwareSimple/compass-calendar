import Foundation

/// Mirrors `apps/calendar-web/src/shortcuts/shortcuts.registry.ts` legend filtering.
public enum ShortcutMenuFilter {
    public enum AppView: String, Sendable {
        case day
        case week
        case life
    }

    public struct Options: Sendable {
        public var view: AppView
        public var isViewingCurrentPeriod: Bool
        public var isFormOpen: Bool
        public var isTrialing: Bool

        public init(
            view: AppView,
            isViewingCurrentPeriod: Bool = true,
            isFormOpen: Bool = false,
            isTrialing: Bool = false
        ) {
            self.view = view
            self.isViewingCurrentPeriod = isViewingCurrentPeriod
            self.isFormOpen = isFormOpen
            self.isTrialing = isTrialing
        }
    }

    public static func isVisible(entry: ShortcutRegistryEntry, options: Options) -> Bool {
        let context = ShortcutContext(
            lifeView: options.view == .life,
            weekView: options.view == .week,
            isFormOpen: options.isFormOpen,
            isTrialing: options.isTrialing)

        if options.view == .life {
            if entry.section == "focus" {
                let allowed: Set<ShortcutId> = [
                    .focusPageJump,
                    .focusFindEvent,
                    .focusCalendarDigit,
                ]
                if !allowed.contains(entry.id) { return false }
            }
            if entry.section == "create" || entry.section == "edit" {
                return false
            }
            if entry.section == "navigate" {
                let when = entry.when
                if when?.lifeView == true { return ShortcutWhen.matches(when, context: context) }
                if entry.id == .navDayView || entry.id == .navWeekView { return true }
                return false
            }
            if entry.id == .otherTimeTravel {
                return false
            }
        } else {
            if entry.when?.lifeView == true {
                return false
            }
            if entry.when?.weekView == true, options.view != .week {
                return false
            }
            if options.view == .day, entry.id == .navDayView { return false }
            if options.view == .week, entry.id == .navWeekView { return false }
            if options.view == .day,
               entry.id == .navShiftLeft || entry.id == .navShiftRight
            {
                return false
            }
        }

        return ShortcutWhen.matches(entry.when, context: context)
    }
}
