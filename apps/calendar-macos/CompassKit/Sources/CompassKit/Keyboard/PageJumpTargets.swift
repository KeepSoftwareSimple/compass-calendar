import Foundation

/// Page-level Mod+digit jump targets (parity with web `page-jump.targets.ts`).
public enum PageJumpTargets {
    public static let dayColumnPrefix = "day-column:"

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

    /// Week-style sidebar map: month picker, then calendar list.
    public static func buildSidebarPageJumpTargets() -> [Resolved] {
        withPickDigits([
            Draft(id: "month-picker", label: "Month picker"),
            Draft(id: "calendars", label: "Calendars"),
        ])
    }

    /// Day view: month picker, each displayed column left to right, then sidebar.
    /// When columns consume every physical key, sidebar targets at the end are omitted.
    public static func buildDayPageJumpTargets(
        displayedCalendars: [(id: String, name: String)]
    ) -> [Resolved] {
        let columnTargets = displayedCalendars.map { calendar in
            Draft(id: dayColumnJumpId(calendarId: calendar.id), label: calendar.name)
        }
        return withPickDigits([
            Draft(id: "month-picker", label: "Month picker"),
        ] + columnTargets + [
            Draft(id: "calendars", label: "Calendars"),
        ])
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
