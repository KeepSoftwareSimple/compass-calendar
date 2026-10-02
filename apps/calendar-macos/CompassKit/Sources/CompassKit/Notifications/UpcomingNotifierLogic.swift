import Foundation

public struct NotifiableEvent: Equatable, Sendable {
    public var id: String
    public var title: String?
    public var startDate: String

    public init(id: String, title: String?, startDate: String) {
        self.id = id
        self.title = title
        self.startDate = startDate
    }
}

public enum UpcomingNotifierLogic {
    public static let notifyLeadMinutes = 5
    private static let firedKeyTTLHours = 24

    public struct TimedCandidate: Equatable, Sendable {
        public var id: String
        public var title: String
        public var startDate: String
        public var endDate: String
        public var isDemo: Bool

        public init(id: String, title: String, startDate: String, endDate: String, isDemo: Bool) {
            self.id = id
            self.title = title
            self.startDate = startDate
            self.endDate = endDate
            self.isDemo = isDemo
        }
    }

    public static func toNotifiableEvents(_ candidates: [TimedCandidate]) -> [NotifiableEvent] {
        candidates.compactMap { candidate in
            guard !candidate.id.isEmpty, !candidate.isDemo else { return nil }
            return NotifiableEvent(
                id: candidate.id,
                title: candidate.title,
                startDate: candidate.startDate)
        }
    }

    public static func notificationKey(for event: NotifiableEvent) -> String {
        "\(event.id)|\(event.startDate)"
    }

    public static func selectEventsToNotify(
        now: Date,
        events: [NotifiableEvent],
        firedKeys: Set<String>
    ) -> [NotifiableEvent] {
        events
            .filter { event in
                if firedKeys.contains(notificationKey(for: event)) { return false }
                guard let start = CompassDateParsing.parseInEffectiveTimeZone(event.startDate) else {
                    return false
                }
                let minutesUntilStart = start.timeIntervalSince(now) / 60
                return minutesUntilStart >= 0 && minutesUntilStart <= Double(notifyLeadMinutes)
            }
            .sorted { lhs, rhs in
                let left = CompassDateParsing.parseInEffectiveTimeZone(lhs.startDate)?.timeIntervalSince1970 ?? 0
                let right = CompassDateParsing.parseInEffectiveTimeZone(rhs.startDate)?.timeIntervalSince1970 ?? 0
                return left < right
            }
    }

    public static func pruneFiredKeys(_ firedKeys: Set<String>, now: Date) -> Set<String> {
        let cutoff = now.addingTimeInterval(-Double(firedKeyTTLHours) * 3600)
        return Set(
            firedKeys.filter { key in
                guard let pipe = key.firstIndex(of: "|") else { return false }
                let startDate = String(key[key.index(after: pipe)...])
                guard let start = CompassDateParsing.parseInEffectiveTimeZone(startDate) else {
                    return false
                }
                return start > cutoff
            })
    }

    public static func notificationPayload(for event: NotifiableEvent) -> DesktopNotificationPayload {
        let title = event.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTitle = (title?.isEmpty == false) ? title! : "Untitled event"
        let body = startTimeBody(for: event.startDate)
        return DesktopNotificationPayload(
            title: resolvedTitle,
            body: body,
            tag: notificationKey(for: event),
            eventId: event.id)
    }

    public static func announceUpcomingEvents(
        now: Date,
        events: [NotifiableEvent],
        firedKeys: Set<String>,
        show: @escaping @Sendable (DesktopNotificationPayload) async -> Bool
    ) async -> Set<String> {
        let due = selectEventsToNotify(now: now, events: events, firedKeys: firedKeys)
        if due.isEmpty { return firedKeys }

        var announced = pruneFiredKeys(firedKeys, now: now)
        for event in due {
            let key = notificationKey(for: event)
            let payload = notificationPayload(for: event)
            let shown = await show(payload)
            if shown {
                announced.insert(key)
            }
        }
        return announced
    }

    public static func startTimeBody(for startDate: String) -> String {
        guard let date = CompassDateParsing.parseInEffectiveTimeZone(startDate) else {
            return "Starts soon"
        }
        let formatter = DateFormatter()
        formatter.calendar = EffectiveTimeZone.calendar
        formatter.timeZone = EffectiveTimeZone.timeZone
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "h:mm a"
        return "Starts at \(formatter.string(from: date))"
    }
}
