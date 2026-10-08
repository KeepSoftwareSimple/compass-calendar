import Foundation

/// Mirrors `apps/calendar-web/src/events/recurrence/projectRecurringEdit.ts`.
public enum ProjectRecurringEdit {
    public struct Input: Sendable {
        public var scope: ScopeEnum
        public var edited: Event
        public var original: Event
        public var seriesEvents: [Event]
        public var seriesMaster: Event?

        public init(
            scope: ScopeEnum,
            edited: Event,
            original: Event,
            seriesEvents: [Event],
            seriesMaster: Event? = nil
        ) {
            self.scope = scope
            self.edited = edited
            self.original = original
            self.seriesEvents = seriesEvents
            self.seriesMaster = seriesMaster
        }
    }

    public static func projectRecurringEdit(_ input: Input) -> RecurringEditProjection {
        if input.scope == .this {
            return RecurringEditProjection(removeIds: [], upserts: [input.edited])
        }

        let affected = input.scope == .all
            ? input.seriesEvents
            : input.seriesEvents.filter { event in
                event.id == input.edited.id || isAtOrAfter(event: event, cutoff: input.original.schedule)
            }

        if case .single = input.edited.recurrence {
            let removeIds = Set(
                affected.filter { $0.id != input.edited.id }.map(\.id.rawValue)
            )
            return RecurringEditProjection(removeIds: removeIds, upserts: [input.edited])
        }

        let occurrenceUpserts = patchAffectedOccurrences(
            affected: affected,
            edited: input.edited,
            original: input.original
        )

        guard input.scope == .thisAndFollowing,
              case .series(let masterPayload) = input.seriesMaster?.recurrence
        else {
            return RecurringEditProjection(removeIds: [], upserts: occurrenceUpserts)
        }

        let splitInstant = scheduleStartString(input.original.schedule)
        let masterStart = scheduleStartString(input.seriesMaster!.schedule)
        guard let splitDate = CompassDateParsing.parseInEffectiveTimeZone(splitInstant),
              let masterStartDate = CompassDateParsing.parseInEffectiveTimeZone(masterStart),
              splitDate > masterStartDate
        else {
            return projectRecurringEdit(
                Input(
                    scope: .all,
                    edited: input.edited,
                    original: input.original,
                    seriesEvents: input.seriesEvents,
                    seriesMaster: input.seriesMaster
                )
            )
        }

        let remainderSeriesId = input.edited.id
        let remainderRules: [String]
        if case .series(let editedSeries) = input.edited.recurrence {
            remainderRules = editedSeries.rules
        } else {
            remainderRules = stripRuleBounds(masterPayload.rules)
        }

        let remainderMaster = copyEvent(
            input.edited,
            id: remainderSeriesId,
            recurrence: .series(.init(kind: "series", rules: remainderRules))
        )
        let truncatedMaster = copyEvent(
            input.seriesMaster!,
            recurrence: .series(
                .init(
                    kind: "series",
                    rules: truncateSeriesRules(masterPayload.rules, beforeStart: splitInstant)
                )
            )
        )

        let removeIds = Set(affected.map(\.id.rawValue))
        let upserts =
            [truncatedMaster, remainderMaster]
            + patchAffectedOccurrences(
                affected: affected,
                edited: input.edited,
                original: input.original,
                remainderSeriesId: remainderSeriesId
            )

        return RecurringEditProjection(removeIds: removeIds, upserts: upserts)
    }

    public static func projectRecurringDelete(
        scope: ScopeEnum,
        target: Event,
        seriesId: EventId,
        seriesEvents: [Event]
    ) -> RecurringEditProjection {
        let affected: [Event]
        if scope == .all {
            affected = seriesEvents
        } else {
            affected = seriesEvents.filter { event in
                event.id == target.id || isAtOrAfter(event: event, cutoff: target.schedule)
            }
        }
        var removeIds = Set(affected.map(\.id.rawValue))
        removeIds.insert(target.id.rawValue)
        if scope == .all {
            removeIds.insert(seriesId.rawValue)
        }
        return RecurringEditProjection(removeIds: removeIds, upserts: [])
    }

    private static func isAtOrAfter(event: Event, cutoff: EventSchedule) -> Bool {
        guard let eventStart = CompassDateParsing.parseInEffectiveTimeZone(scheduleStartString(event.schedule)),
              let cutoffStart = CompassDateParsing.parseInEffectiveTimeZone(scheduleStartString(cutoff))
        else {
            return false
        }
        return eventStart >= cutoffStart
    }

    private static func patchAffectedOccurrences(
        affected: [Event],
        edited: Event,
        original: Event,
        remainderSeriesId: EventId? = nil
    ) -> [Event] {
        affected.map { event in
            let patched = seriesPatch(event: event, edited: edited)
            let withSeries: Event
            if let remainderSeriesId {
                withSeries = copyEvent(
                    patched,
                    recurrence: .occurrence(.init(kind: "occurrence", seriesId: remainderSeriesId))
                )
            } else {
                withSeries = patched
            }
            if event.id == edited.id {
                return copyEvent(withSeries, schedule: edited.schedule)
            }
            return shiftEvent(event: withSeries, original: original, edited: edited)
        }
    }

    private static func seriesPatch(event: Event, edited: Event) -> Event {
        let recurrence: EventRecurrence
        switch event.recurrence {
        case .occurrence:
            recurrence = event.recurrence
        default:
            recurrence = edited.recurrence
        }
        return copyEvent(event, content: edited.content, recurrence: recurrence)
    }

    private static func shiftEvent(event: Event, original: Event, edited: Event) -> Event {
        if scheduleKind(original.schedule) != scheduleKind(edited.schedule) {
            return copyEvent(
                event,
                schedule: convertScheduleKind(event: event, original: original, edited: edited)
            )
        }

        guard let startDelta = scheduleStartDate(edited.schedule)?
            .timeIntervalSince(scheduleStartDate(original.schedule) ?? .distantPast),
            let endDelta = scheduleEndDate(edited.schedule)?
                .timeIntervalSince(scheduleEndDate(original.schedule) ?? .distantPast)
        else {
            return event
        }

        switch event.schedule {
        case .timed(let payload):
            guard let start = CompassDateParsing.parseInEffectiveTimeZone(payload.start.rawValue),
                  let end = CompassDateParsing.parseInEffectiveTimeZone(payload.end.rawValue)
            else {
                return event
            }
            let shiftedStart = Date(timeInterval: startDelta, since: start)
            let shiftedEnd = Date(timeInterval: endDelta, since: end)
            return copyEvent(
                event,
                schedule: .timed(
                    .init(
                        end: .init(rawValue: CompassDateParsing.formatLikeDayjs(shiftedEnd)),
                        kind: "timed",
                        start: .init(rawValue: CompassDateParsing.formatLikeDayjs(shiftedStart)),
                        timeZone: payload.timeZone
                    )
                )
            )
        case .allDay(let payload):
            let dayDelta = Int((startDelta / (24 * 60 * 60)).rounded())
            return copyEvent(
                event,
                schedule: .allDay(
                    .init(
                        end: shiftDateOnly(payload.end, byDays: dayDelta),
                        kind: "allDay",
                        start: shiftDateOnly(payload.start, byDays: dayDelta)
                    )
                )
            )
        }
    }

    private static func convertScheduleKind(event: Event, original: Event, edited: Event) -> EventSchedule {
        guard let originalStart = scheduleStartDate(original.schedule),
              let eventStart = scheduleStartDate(event.schedule)
        else {
            return event.schedule
        }

        let calendar = EffectiveTimeZone.calendar
        let dayOffset = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: originalStart),
            to: calendar.startOfDay(for: eventStart)
        ).day ?? 0

        switch edited.schedule {
        case .allDay(let editedPayload):
            return .allDay(
                .init(
                    end: shiftDateOnly(editedPayload.end, byDays: dayOffset),
                    kind: "allDay",
                    start: shiftDateOnly(editedPayload.start, byDays: dayOffset)
                )
            )
        case .timed(let editedPayload):
            guard let editedStart = CompassDateParsing.parseInEffectiveTimeZone(editedPayload.start.rawValue)
            else {
                return event.schedule
            }
            let local = editedStart
            let shiftedDay = calendar.date(byAdding: .day, value: dayOffset, to: local) ?? local
            let dayString = CompassDateParsing.formatCalendarDay(shiftedDay)
            let timeString = CompassDateParsing.formatLikeDayjs(editedStart)
                .split(separator: "T")
                .last?
                .split(separator: "+")
                .first?
                .split(separator: "-")
                .first
            let combined = "\(dayString)T\(timeString ?? "00:00:00")"
            let shiftedStart = CompassDateParsing.parseInEffectiveTimeZone(combined) ?? shiftedDay
            let duration = (scheduleEndDate(edited.schedule)?.timeIntervalSince(editedStart)) ?? 3600
            let shiftedEnd = shiftedStart.addingTimeInterval(duration)
            return .timed(
                .init(
                    end: .init(rawValue: CompassDateParsing.formatLikeDayjs(shiftedEnd)),
                    kind: "timed",
                    start: .init(rawValue: CompassDateParsing.formatLikeDayjs(shiftedStart)),
                    timeZone: editedPayload.timeZone
                )
            )
        }
    }

    private static func truncateSeriesRules(_ rules: [String], beforeStart: String) -> [String] {
        let excludedInstant =
            CompassDateParsing.parseInEffectiveTimeZone(beforeStart) ?? Date()
        let until = excludedInstant.addingTimeInterval(-1)
        let untilToken = CompassDateParsing.formatISO8601UTC(until)
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: ":", with: "")
            .replacingOccurrences(of: ".000", with: "")
            .prefix(15)

        return rules.map { rule in
            guard rule.hasPrefix("RRULE:") else { return rule }
            let body = rule.dropFirst("RRULE:".count)
            let kept = body.split(separator: ";").filter { part in
                !part.hasPrefix("UNTIL=") && !part.hasPrefix("COUNT=")
            }
            return "RRULE:\(kept.joined(separator: ";"));UNTIL=\(untilToken)Z"
        }
    }

    private static func stripRuleBounds(_ rules: [String]) -> [String] {
        rules.map { rule in
            rule.split(separator: ";")
                .filter { part in
                    let upper = part.uppercased()
                    return !upper.hasPrefix("COUNT=") && !upper.hasPrefix("UNTIL=")
                }
                .joined(separator: ";")
        }
    }

    private static func scheduleStartString(_ schedule: EventSchedule) -> String {
        switch schedule {
        case .allDay(let payload):
            return payload.start
        case .timed(let payload):
            return payload.start.rawValue
        }
    }

    private static func scheduleEndString(_ schedule: EventSchedule) -> String {
        switch schedule {
        case .allDay(let payload):
            return payload.end
        case .timed(let payload):
            return payload.end.rawValue
        }
    }

    private static func scheduleStartDate(_ schedule: EventSchedule) -> Date? {
        CompassDateParsing.parseInEffectiveTimeZone(scheduleStartString(schedule))
    }

    private static func scheduleEndDate(_ schedule: EventSchedule) -> Date? {
        CompassDateParsing.parseInEffectiveTimeZone(scheduleEndString(schedule))
    }

    private static func scheduleKind(_ schedule: EventSchedule) -> String {
        switch schedule {
        case .allDay:
            return "allDay"
        case .timed:
            return "timed"
        }
    }

    private static func shiftDateOnly(_ value: String, byDays days: Int) -> String {
        guard let date = CompassDateParsing.parseInEffectiveTimeZone(value),
              let shifted = EffectiveTimeZone.calendar.date(byAdding: .day, value: days, to: date)
        else {
            return value
        }
        return CompassDateParsing.formatCalendarDay(shifted)
    }

    private static func copyEvent(
        _ event: Event,
        id: EventId? = nil,
        content: EventContent? = nil,
        recurrence: EventRecurrence? = nil,
        schedule: EventSchedule? = nil
    ) -> Event {
        Event(
            calendarId: event.calendarId,
            content: content ?? event.content,
            createdAt: event.createdAt,
            icalUid: event.icalUid,
            id: id ?? event.id,
            providerManaged: event.providerManaged,
            recurrence: recurrence ?? event.recurrence,
            schedule: schedule ?? event.schedule,
            updatedAt: event.updatedAt
        )
    }
}
