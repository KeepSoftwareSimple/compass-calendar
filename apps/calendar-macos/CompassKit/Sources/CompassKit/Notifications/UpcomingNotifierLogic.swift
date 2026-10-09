import Foundation

public struct NotifiableEvent: Equatable, Sendable {
    public var id: String
    public var title: String?
    public var startDate: String
    public var popupReminderMinutes: [Int]?

    public init(
        id: String,
        title: String?,
        startDate: String,
        popupReminderMinutes: [Int]? = nil
    ) {
        self.id = id
        self.title = title
        self.startDate = startDate
        self.popupReminderMinutes = popupReminderMinutes
    }
}

public struct DueEventReminder: Equatable, Sendable {
    public var event: NotifiableEvent
    public var reminderMinutes: Int
}

public enum UpcomingNotifierLogic {
    public static let notifyLeadMinutes = 5
    public static let missedReminderGraceMinutes = 60
    public static let maxNotificationLookaheadMinutes = 24 * 60
    private static let firedKeyTTLHours = 24

    public struct TimedCandidate: Equatable, Sendable {
        public var id: String
        public var title: String
        public var startDate: String
        public var endDate: String
        public var isDemo: Bool
        public var popupReminderMinutes: [Int]?

        public init(
            id: String,
            title: String,
            startDate: String,
            endDate: String,
            isDemo: Bool,
            popupReminderMinutes: [Int]? = nil
        ) {
            self.id = id
            self.title = title
            self.startDate = startDate
            self.endDate = endDate
            self.isDemo = isDemo
            self.popupReminderMinutes = popupReminderMinutes
        }
    }

    public static func toNotifiableEvents(_ candidates: [TimedCandidate]) -> [NotifiableEvent] {
        candidates.compactMap { candidate in
            guard !candidate.id.isEmpty, !candidate.isDemo else { return nil }
            return NotifiableEvent(
                id: candidate.id,
                title: candidate.title,
                startDate: candidate.startDate,
                popupReminderMinutes: candidate.popupReminderMinutes)
        }
    }

    public static func notificationKey(for event: NotifiableEvent, reminderMinutes: Int) -> String {
        "\(event.id)|\(event.startDate)|\(reminderMinutes)"
    }

    public static func effectivePopupReminderMinutes(for event: NotifiableEvent) -> [Int] {
        if let synced = event.popupReminderMinutes { return synced }
        return [notifyLeadMinutes]
    }

    public static func selectEventsToNotify(
        now: Date,
        events: [NotifiableEvent],
        firedKeys: Set<String>,
        allowMissedGrace: Bool = false
    ) -> [DueEventReminder] {
        var due: [DueEventReminder] = []
        for event in events {
            guard let start = CompassDateParsing.parseInEffectiveTimeZone(event.startDate) else {
                continue
            }
            let minutesUntilStart = start.timeIntervalSince(now) / 60
            for reminderMinutes in effectivePopupReminderMinutes(for: event) {
                let key = notificationKey(for: event, reminderMinutes: reminderMinutes)
                if firedKeys.contains(key) { continue }
                if minutesUntilStart > Double(reminderMinutes) { continue }
                let beforeStart = minutesUntilStart >= 0
                let missedWithinGrace = allowMissedGrace
                    && minutesUntilStart < 0
                    && minutesUntilStart >= -Double(missedReminderGraceMinutes)
                if beforeStart || missedWithinGrace {
                    due.append(DueEventReminder(event: event, reminderMinutes: reminderMinutes))
                }
            }
        }
        return due.sorted { lhs, rhs in
            let left = CompassDateParsing.parseInEffectiveTimeZone(lhs.event.startDate)?
                .timeIntervalSince1970 ?? 0
            let right = CompassDateParsing.parseInEffectiveTimeZone(rhs.event.startDate)?
                .timeIntervalSince1970 ?? 0
            if left != right { return left < right }
            return lhs.reminderMinutes > rhs.reminderMinutes
        }
    }

    public static func pruneFiredKeys(_ firedKeys: Set<String>, now: Date) -> Set<String> {
        let cutoff = now.addingTimeInterval(-Double(firedKeyTTLHours) * 3600)
        return Set(
            firedKeys.filter { key in
                guard let firstPipe = key.firstIndex(of: "|") else { return false }
                let afterId = key[key.index(after: firstPipe)...]
                guard let secondPipe = afterId.firstIndex(of: "|") else { return false }
                let startDate = String(afterId[..<secondPipe])
                guard let start = CompassDateParsing.parseInEffectiveTimeZone(startDate) else {
                    return false
                }
                return start > cutoff
            })
    }

    public static func notificationPayload(
        for event: NotifiableEvent,
        reminderMinutes: Int,
        now: Date = Date()
    ) -> DesktopNotificationPayload {
        let title = event.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTitle = (title?.isEmpty == false) ? title! : "Untitled event"
        let body = startTimeBody(for: event.startDate, now: now)
        return DesktopNotificationPayload(
            title: resolvedTitle,
            body: body,
            tag: notificationKey(for: event, reminderMinutes: reminderMinutes),
            eventId: event.id)
    }

    @MainActor
    public static func announceUpcomingEvents(
        now: Date,
        events: [NotifiableEvent],
        firedKeys: Set<String>,
        allowMissedGrace: Bool = false,
        show: @escaping @Sendable (DesktopNotificationPayload) async -> Bool
    ) async -> Set<String> {
        let due = selectEventsToNotify(
            now: now,
            events: events,
            firedKeys: firedKeys,
            allowMissedGrace: allowMissedGrace)
        if due.isEmpty { return firedKeys }

        var announced = pruneFiredKeys(firedKeys, now: now)
        for entry in due {
            let key = notificationKey(for: entry.event, reminderMinutes: entry.reminderMinutes)
            let payload = notificationPayload(
                for: entry.event,
                reminderMinutes: entry.reminderMinutes,
                now: now)
            let shown = await show(payload)
            if shown {
                announced.insert(key)
            }
        }
        return announced
    }

    public static func startTimeBody(for startDate: String, now: Date = Date()) -> String {
        guard let date = CompassDateParsing.parseInEffectiveTimeZone(startDate) else {
            return "Starts soon"
        }
        let minutesUntilStart = max(0, Int(ceil(date.timeIntervalSince(now) / 60)))
        let formatter = DateFormatter()
        formatter.calendar = EffectiveTimeZone.calendar
        formatter.timeZone = EffectiveTimeZone.timeZone
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "h:mm a"
        let startLabel = formatter.string(from: date)
        if minutesUntilStart == 0 {
            return "Starting now (\(startLabel))"
        }
        if minutesUntilStart == 1 {
            return "Starts in 1 minute (\(startLabel))"
        }
        return "Starts in \(minutesUntilStart) minutes (\(startLabel))"
    }
}
