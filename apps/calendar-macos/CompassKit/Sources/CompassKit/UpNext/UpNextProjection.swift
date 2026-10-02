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

public enum UpNextProjection {
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
                isDemo: demoEventIds.contains(event.id.rawValue))
        }
    }
}
