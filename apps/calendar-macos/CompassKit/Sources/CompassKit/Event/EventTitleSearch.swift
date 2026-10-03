import Foundation

/// Mirrors `packages/core/src/event/search-events-by-title.ts`.
public enum EventTitleSearch {
    public static let minQueryLength = 2
    public static let defaultLimit = 20
    public static let paletteLimit = 8
    private static let yearInterval: TimeInterval = 365 * 24 * 60 * 60

    public static func searchWindow(now: Date = Date()) -> (start: Date, end: Date) {
        (
            start: now.addingTimeInterval(-yearInterval),
            end: now.addingTimeInterval(yearInterval)
        )
    }

    public static func eventTitle(_ event: Event) -> String {
        switch event.content {
        case .busy:
            return ""
        case .details(let details):
            return details.title
        }
    }

    public static func eventStartMs(_ event: Event) -> TimeInterval {
        switch event.schedule {
        case .allDay(let allDay):
            let parts = allDay.start.split(separator: "-")
            guard parts.count == 3,
                  let year = Int(parts[0]),
                  let month = Int(parts[1]),
                  let day = Int(parts[2])
            else { return .nan }
            var components = DateComponents()
            components.year = year
            components.month = month
            components.day = day
            components.timeZone = TimeZone(secondsFromGMT: 0)
            return EffectiveTimeZone.calendar.date(from: components)?.timeIntervalSince1970 ?? .nan
        case .timed(let timed):
            return CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue)?.timeIntervalSince1970 ?? .nan
        }
    }

    public static func search(
        events: [Event],
        query: String,
        now: Date = Date(),
        limit: Int = defaultLimit
    ) -> [Event] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard needle.count >= minQueryLength else { return [] }

        let window = searchWindow(now: now)
        let windowStart = window.start.timeIntervalSince1970
        let windowEnd = window.end.timeIntervalSince1970
        let nowMs = now.timeIntervalSince1970

        let matches = events.filter { event in
            let start = eventStartMs(event)
            if start.isNaN || start < windowStart || start > windowEnd { return false }
            return eventTitle(event).lowercased().contains(needle)
        }
        .sorted { abs(eventStartMs($0) - nowMs) < abs(eventStartMs($1) - nowMs) }

        var seenSeriesIds = Set<String>()
        var collapsed: [Event] = []
        for match in matches {
            if case .occurrence(let payload) = match.recurrence {
                if seenSeriesIds.contains(payload.seriesId.rawValue) { continue }
                seenSeriesIds.insert(payload.seriesId.rawValue)
            }
            collapsed.append(match)
        }

        return collapsed.filter { event in
            if case .series = event.recurrence {
                return !seenSeriesIds.contains(event.id.rawValue)
            }
            return true
        }
        .prefix(limit)
        .map { $0 }
    }
}
