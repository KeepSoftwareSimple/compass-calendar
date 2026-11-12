import Foundation

/// Page-level Mod+digit jump targets (parity with web `page-jump.targets.ts`).
public enum PageJumpTargets {
    public static let dayColumnPrefix = "day-column:"
    public static let calendarAccountPrefix = "calendar-account:"

    public struct Draft: Sendable, Hashable {
        public var id: String
        public var label: String

        public init(id: String, label: String) {
            self.id = id
            self.label = label
        }
    }

    public struct Resolved: Sendable, Hashable, Identifiable {
        public var id: String
        public var digit: String
        public var label: String

        public init(id: String, digit: String, label: String) {
            self.id = id
            self.digit = digit
            self.label = label
        }
    }

    public static func dayColumnJumpId(calendarId: String) -> String {
        "\(dayColumnPrefix)\(calendarId)"
    }

    /// Web `calendarAccountJumpId`: one target per connected account heading.
    public static func calendarAccountJumpId(accountKey: String) -> String {
        "\(calendarAccountPrefix)\(accountKey)"
    }

    /// Web `VIEW_SELECT_TARGET`: the view dropdown always comes first.
    static let viewSelect = Draft(id: "view-select", label: "View dropdown")

    /// Web sidebar map: month picker, Up next, then one target per connected
    /// account. With no accounts, a single "calendars" slot covers the list.
    private static func sidebarDrafts(accounts: [(key: String, label: String)]) -> [Draft] {
        let calendarDrafts = accounts.isEmpty
            ? [Draft(id: "calendars", label: "Calendar list")]
            : accounts.map { Draft(id: calendarAccountJumpId(accountKey: $0.key), label: $0.label) }
        return [
            Draft(id: "month-picker", label: "Month picker"),
            Draft(id: "up-next", label: "Up next"),
        ] + calendarDrafts
    }

    /// Week view (web `buildCalendarPageJumpTargets`): view dropdown, then the
    /// sidebar map. Accounts past the physical keys get no target.
    public static func buildSidebarPageJumpTargets(
        accounts: [(key: String, label: String)] = []
    ) -> [Resolved] {
        withPickDigits([viewSelect] + sidebarDrafts(accounts: accounts))
    }

    /// Life view (web `LIFE_PAGE_JUMP_TARGETS`): view dropdown, current week,
    /// life variation, then life details.
    public static func buildLifePageJumpTargets() -> [Resolved] {
        withPickDigits([
            viewSelect,
            Draft(id: "life-grid", label: "Current week"),
            Draft(id: "life-variation", label: "Life variation"),
            Draft(id: "life-details", label: "Life details"),
        ])
    }

    /// Day view (web `buildDayPageJumpTargets`): view dropdown, each displayed
    /// column left to right, then the sidebar map. When columns consume every
    /// physical key, sidebar targets at the end are omitted first.
    public static func buildDayPageJumpTargets(
        displayedCalendars: [(id: String, name: String)],
        accounts: [(key: String, label: String)] = []
    ) -> [Resolved] {
        let columnTargets = displayedCalendars.map { calendar in
            Draft(id: dayColumnJumpId(calendarId: calendar.id), label: calendar.name)
        }
        return withPickDigits([viewSelect] + columnTargets + sidebarDrafts(accounts: accounts))
    }

    public static func dayColumnJumpDigits(from targets: [Resolved]) -> [String: String] {
        dayColumnJumpDigits(from: targets.map { (id: $0.id, digit: $0.digit) })
    }

    public static func dayColumnJumpDigits(
        from targets: some Sequence<(id: String, digit: String)>
    ) -> [String: String] {
        var map: [String: String] = [:]
        for target in targets {
            guard target.id.hasPrefix(dayColumnPrefix) else { continue }
            map[String(target.id.dropFirst(dayColumnPrefix.count))] = target.digit
        }
        return map
    }

    private static func withPickDigits(_ drafts: [Draft]) -> [Resolved] {
        drafts.prefix(FormFieldDigitMapping.pickKeyLabels.count).enumerated().map {
            index,
            draft in
            Resolved(
                id: draft.id,
                digit: FormFieldDigitMapping.pickKeyLabels[index],
                label: draft.label
            )
        }
    }
}
