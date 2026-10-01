import Foundation

public struct DesktopAgendaMenuEntry: Equatable, Sendable {
    public enum Kind: Equatable, Sendable {
        case emptyState
        case event(eventId: String, label: String)
    }

    public var kind: Kind

    public init(kind: Kind) {
        self.kind = kind
    }
}

public struct DesktopAgendaPresentation: Equatable, Sendable {
    public var statusBarTitle: String
    /// When nil, the Dock badge is cleared.
    public var dockBadgeLabel: String?
    public var menuEntries: [DesktopAgendaMenuEntry]

    public init(
        statusBarTitle: String,
        dockBadgeLabel: String?,
        menuEntries: [DesktopAgendaMenuEntry]
    ) {
        self.statusBarTitle = statusBarTitle
        self.dockBadgeLabel = dockBadgeLabel
        self.menuEntries = menuEntries
    }
}

public enum DesktopAgendaFormatter {
    public static let statusTitleMaxLength = 28
    public static let menuTitleMaxLength = 48

    public static func presentation(
        items: [DesktopAgendaItem],
        now: Date,
        calendar: Calendar = .current,
        dateFormatter: DateFormatter? = nil
    ) -> DesktopAgendaPresentation {
        let formatter = dateFormatter ?? Self.timeFormatter(calendar: calendar)
        let parsed = items.compactMap { item -> (DesktopAgendaItem, Date, Date)? in
            guard let start = Self.parseInstant(item.startsAt),
                  let end = Self.parseInstant(item.endsAt)
            else {
                return nil
            }
            return (item, start, end)
        }

        let dayStart = calendar.startOfDay(for: now)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else {
            return emptyPresentation()
        }

        let todays = parsed.filter { _, start, end in
            start < dayEnd && end > dayStart
        }

        let upcoming = todays.filter { _, start, _ in start > now }
        let dockBadgeLabel: String? = upcoming.isEmpty ? nil : String(upcoming.count)

        guard let next = upcoming.first else {
            return DesktopAgendaPresentation(
                statusBarTitle: "Nothing else today",
                dockBadgeLabel: dockBadgeLabel,
                menuEntries: menuEntries(for: todays, now: now, dateFormatter: formatter))
        }

        let title = truncate(next.0.title, maxLength: statusTitleMaxLength)
        let relative = relativeLeadMinutes(from: now, to: next.1)
        let statusBarTitle = "Next: \(title) \(relative)"

        return DesktopAgendaPresentation(
            statusBarTitle: statusBarTitle,
            dockBadgeLabel: dockBadgeLabel,
            menuEntries: menuEntries(for: todays, now: now, dateFormatter: formatter))
    }

    private static func menuEntries(
        for todays: [(DesktopAgendaItem, Date, Date)],
        now: Date,
        dateFormatter: DateFormatter
    ) -> [DesktopAgendaMenuEntry] {
        if todays.isEmpty {
            return [DesktopAgendaMenuEntry(kind: .emptyState)]
        }

        return todays.map { item, start, end in
            let timeLabel = dateFormatter.string(from: start)
            let title = truncate(item.title, maxLength: menuTitleMaxLength)
            let suffix: String
            if end <= now {
                suffix = " (ended)"
            } else if start <= now {
                suffix = " (now)"
            } else {
                suffix = ""
            }
            return DesktopAgendaMenuEntry(
                kind: .event(
                    eventId: item.id,
                    label: "\(timeLabel) · \(title)\(suffix)"))
        }
    }

    private static func emptyPresentation() -> DesktopAgendaPresentation {
        DesktopAgendaPresentation(
            statusBarTitle: "Nothing else today",
            dockBadgeLabel: nil,
            menuEntries: [DesktopAgendaMenuEntry(kind: .emptyState)])
    }

    public static func relativeLeadMinutes(from now: Date, to start: Date) -> String {
        let seconds = start.timeIntervalSince(now)
        if seconds <= 0 {
            return "now"
        }
        let minutes = Int((seconds / 60).rounded(.down))
        if minutes < 60 {
            return "in \(minutes)m"
        }
        let hours = Int((seconds / 3600).rounded(.down))
        return "in \(hours)h"
    }

    public static func truncate(_ title: String, maxLength: Int) -> String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > maxLength else { return trimmed }
        let index = trimmed.index(trimmed.startIndex, offsetBy: max(0, maxLength - 1))
        return String(trimmed[..<index]) + "…"
    }

    public static func parseInstant(_ value: String) -> Date? {
        if let date = iso8601WithFractional.date(from: value) {
            return date
        }
        return iso8601.date(from: value)
    }

    private static let iso8601WithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static func timeFormatter(calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter
    }
}
