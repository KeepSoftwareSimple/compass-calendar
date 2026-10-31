import Foundation

public struct UpNextOccurrence: Equatable, Sendable {
    public var id: String
    public var title: String
    public var startDate: String
    public var endDate: String

    public init(id: String, title: String, startDate: String, endDate: String) {
        self.id = id
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
    }
}

public struct UpNextSnapshot: Equatable, Sendable {
    public var upNext: UpNextOccurrence?
    public var isCurrentEvent: Bool

    public init(upNext: UpNextOccurrence?, isCurrentEvent: Bool) {
        self.upNext = upNext
        self.isCurrentEvent = isCurrentEvent
    }
}

public struct UpNextNudgeWindow: Equatable, Sendable {
    public var occurrences: [UpNextOccurrence]
    public var primary: UpNextOccurrence?
    public var isPrimaryCurrent: Bool
    public var hasCurrentEvent: Bool

    public init(
        occurrences: [UpNextOccurrence],
        primary: UpNextOccurrence?,
        isPrimaryCurrent: Bool,
        hasCurrentEvent: Bool
    ) {
        self.occurrences = occurrences
        self.primary = primary
        self.isPrimaryCurrent = isPrimaryCurrent
        self.hasCurrentEvent = hasCurrentEvent
    }
}

public enum UpNextNudgeFormatting {
    public static let leadMinutes = 2

    public static func multiSummary(count: Int, hasCurrentEvent: Bool) -> String {
        if hasCurrentEvent {
            return "\(count) events now"
        }
        return "\(count) events starting soon"
    }

    public static func pickerTitle(count: Int, hasCurrentEvent: Bool) -> String {
        let plural = count == 1 ? "" : "s"
        if hasCurrentEvent {
            return "You have \(count) event\(plural). Select which event to open"
        }
        return "You have \(count) upcoming event\(plural). Select which event to open"
    }
}

public enum UpNextProjection {
    /// Drop events hidden on the grid (hidden calendar or individually hidden id).
    public static func filterGridVisibleEvents(
        _ events: [Event],
        hiddenEventIds: Set<String>,
        isCalendarVisible: (String) -> Bool
    ) -> [Event] {
        events.filter { event in
            isCalendarVisible(event.calendarId.rawValue)
                && !hiddenEventIds.contains(event.id.rawValue)
        }
    }

    public static func snapshot(
        now: Date,
        timedCandidates: [UpcomingNotifierLogic.TimedCandidate]
    ) -> UpNextSnapshot {
        let parsed: [(UpcomingNotifierLogic.TimedCandidate, Date, Date)] = timedCandidates.compactMap {
            candidate in
            guard let start = CompassDateParsing.parseInEffectiveTimeZone(candidate.startDate),
                  let end = CompassDateParsing.parseInEffectiveTimeZone(candidate.endDate)
            else {
                return nil
            }
            return (candidate, start, end)
        }

        let nowEvents = parsed
            .filter { _, start, end in start <= now && end > now }
            .sorted { $0.2 < $1.2 }

        let upcoming = parsed
            .filter { _, start, _ in start > now }
            .sorted { $0.1 < $1.1 }

        if let current = nowEvents.first {
            return UpNextSnapshot(
                upNext: UpNextOccurrence(
                    id: current.0.id,
                    title: current.0.title,
                    startDate: current.0.startDate,
                    endDate: current.0.endDate),
                isCurrentEvent: true)
        }
        if let next = upcoming.first {
            return UpNextSnapshot(
                upNext: UpNextOccurrence(
                    id: next.0.id,
                    title: next.0.title,
                    startDate: next.0.startDate,
                    endDate: next.0.endDate),
                isCurrentEvent: false)
        }
        return UpNextSnapshot(upNext: nil, isCurrentEvent: false)
    }

    public static func nudgeWindow(
        now: Date,
        timedCandidates: [UpcomingNotifierLogic.TimedCandidate],
        leadMinutes: Int = UpNextNudgeFormatting.leadMinutes
    ) -> UpNextNudgeWindow {
        let parsed: [(UpcomingNotifierLogic.TimedCandidate, Date, Date)] = timedCandidates.compactMap {
            candidate in
            guard let start = CompassDateParsing.parseInEffectiveTimeZone(candidate.startDate),
                  let end = CompassDateParsing.parseInEffectiveTimeZone(candidate.endDate)
            else {
                return nil
            }
            return (candidate, start, end)
        }

        let lead = TimeInterval(leadMinutes * 60)
        let current = parsed
            .filter { _, start, end in start <= now && end > now }
            .sorted { $0.2 < $1.2 }
        let upcoming = parsed
            .filter { _, start, _ in
                start > now && start.timeIntervalSince(now) <= lead
            }
            .sorted { $0.1 < $1.1 }

        let occurrences = (current + upcoming).map { candidate, _, _ in
            UpNextOccurrence(
                id: candidate.id,
                title: candidate.title,
                startDate: candidate.startDate,
                endDate: candidate.endDate)
        }

        let primary = occurrences.first
        let isPrimaryCurrent = primary.map { primary in
            current.contains { $0.0.id == primary.id }
        } ?? false

        return UpNextNudgeWindow(
            occurrences: occurrences,
            primary: primary,
            isPrimaryCurrent: isPrimaryCurrent,
            hasCurrentEvent: !current.isEmpty)
    }

    public static func timedCandidates(
        from events: [Event],
        demoEventIds: Set<String> = []
    ) -> [UpcomingNotifierLogic.TimedCandidate] {
        events.compactMap { event in
            guard case .timed(let payload) = event.schedule else { return nil }
            let title: String
            switch event.content {
            case .busy:
                title = CalendarEventViewModel.busyEventTitle
            case .details(let details):
                title = details.title
            }
            return UpcomingNotifierLogic.TimedCandidate(
                id: event.id.rawValue,
                title: title,
                startDate: payload.start.rawValue,
                endDate: payload.end.rawValue,
                isDemo: demoEventIds.contains(event.id.rawValue),
                popupReminderMinutes: event.popupReminderMinutes)
        }
    }
}
