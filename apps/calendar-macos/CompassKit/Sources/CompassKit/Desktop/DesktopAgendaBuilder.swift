import Foundation

public enum DesktopAgendaBuilder {
    public static let maxItems = 20
    public static let debounceMilliseconds = 250

    public static func build(
        now: Date,
        candidates: [UpcomingNotifierLogic.TimedCandidate]
    ) -> [DesktopAgendaItem] {
        let calendar = EffectiveTimeZone.calendar
        let dayStart = calendar.startOfDay(for: now)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else {
            return []
        }

        let parsed: [(DesktopAgendaItem, Date)] = candidates.compactMap { candidate in
            guard !candidate.isDemo,
                  let start = CompassDateParsing.parseInEffectiveTimeZone(candidate.startDate),
                  let end = CompassDateParsing.parseInEffectiveTimeZone(candidate.endDate)
            else {
                return nil
            }
            guard start < dayEnd, end > dayStart else { return nil }
            let title = candidate.title.trimmingCharacters(in: .whitespacesAndNewlines)
            let resolved = title.isEmpty ? "Untitled event" : title
            let item = DesktopAgendaItem(
                id: candidate.id,
                title: resolved,
                startsAt: candidate.startDate,
                endsAt: candidate.endDate)
            return (item, start)
        }

        return parsed
            .sorted { $0.1 < $1.1 }
            .prefix(maxItems)
            .map(\.0)
    }
}
