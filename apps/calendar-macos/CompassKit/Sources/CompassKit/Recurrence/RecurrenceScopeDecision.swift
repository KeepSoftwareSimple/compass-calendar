import Foundation

/// Mirrors `apps/calendar-web/src/events/recurrence/recurrence-scope-decision.ts`.
public enum RecurrenceScopeDecision: Sendable, Equatable {
    case apply(scope: ScopeEnum)
    case convertToStandalone
}

public enum RecurrenceScopeDecisionLogic {
    public static func isExistingEventRecurring(_ event: Event?) -> Bool {
        guard let event else { return false }
        switch event.recurrence {
        case .single:
            return false
        case .series, .occurrence:
            return true
        }
    }

    public static func resolveDelete(isRecurring: Bool) -> RecurrenceScopeDecision {
        _ = isRecurring
        return .apply(scope: .this)
    }

    public struct SaveInput: Sendable {
        public var isEditDraft: Bool
        public var draftRecurrenceKind: String
        public var explicitSeriesRules: [String]?
        public var schedule: DraftSchedule
        public var baselineEvent: Event?
        public var seriesMaster: Event?
        public var isRecurring: Bool
        public var isInstance: Bool

        public init(
            isEditDraft: Bool,
            draftRecurrenceKind: String,
            explicitSeriesRules: [String]?,
            schedule: DraftSchedule,
            baselineEvent: Event?,
            seriesMaster: Event?,
            isRecurring: Bool,
            isInstance: Bool
        ) {
            self.isEditDraft = isEditDraft
            self.draftRecurrenceKind = draftRecurrenceKind
            self.explicitSeriesRules = explicitSeriesRules
            self.schedule = schedule
            self.baselineEvent = baselineEvent
            self.seriesMaster = seriesMaster
            self.isRecurring = isRecurring
            self.isInstance = isInstance
        }
    }

    public static func resolveSave(_ input: SaveInput) -> RecurrenceScopeDecision {
        guard input.isEditDraft else {
            return .apply(scope: .this)
        }

        let rule = getScopeDecisionRecurrenceRule(input: input)
        let toStandalone = input.isInstance && rule == nil
        if toStandalone {
            return .convertToStandalone
        }

        if input.isRecurring,
           input.isInstance,
           input.draftRecurrenceKind == "preserve"
        {
            return .apply(scope: .this)
        }

        if input.isRecurring, input.draftRecurrenceKind != "preserve" {
            return .apply(scope: .thisAndFollowing)
        }

        let hasMultiple = hasMultipleRecurrenceOccurrences(
            schedule: input.schedule,
            rules: rule
        )
        let isSingleOccurrenceInstance = input.isRecurring && input.isInstance && !hasMultiple
        let scope: ScopeEnum = isSingleOccurrenceInstance ? .all : .this
        return .apply(scope: scope)
    }

    public static func hasMultipleRecurrenceOccurrences(
        schedule: DraftSchedule,
        rules: [String]?
    ) -> Bool {
        guard let rules, !rules.isEmpty else { return true }
        let startISO = scheduleStartISO(schedule)
        let endISO = scheduleEndISO(schedule)
        guard
            let line = RecurrenceRuleLine.firstRule(from: rules),
            let rule = RecurrenceRule(
                startDateISO: startISO,
                endDateISO: endISO,
                recurrenceRule: line,
                timeZoneIdentifier: EffectiveTimeZone.identifier
            )
        else {
            return true
        }
        return rule.all(limit: 2).count > 1
    }

    private static func getScopeDecisionRecurrenceRule(input: SaveInput) -> [String]? {
        if input.draftRecurrenceKind == "series" {
            return input.explicitSeriesRules
        }
        if input.draftRecurrenceKind == "single" {
            return nil
        }
        guard let baselineEvent = input.baselineEvent else { return nil }
        switch baselineEvent.recurrence {
        case .series(let payload):
            return payload.rules
        case .occurrence:
            if case .series(let master) = input.seriesMaster?.recurrence {
                return master.rules
            }
            return nil
        case .single:
            return nil
        }
    }

    private static func scheduleStartISO(_ schedule: DraftSchedule) -> String {
        switch schedule.kind {
        case .timed:
            return CompassDateParsing.formatLikeDayjs(schedule.start)
        case .allDay:
            return CompassDateParsing.formatCalendarDay(schedule.start)
        }
    }

    private static func scheduleEndISO(_ schedule: DraftSchedule) -> String {
        switch schedule.kind {
        case .timed:
            return CompassDateParsing.formatLikeDayjs(schedule.end)
        case .allDay:
            return CompassDateParsing.formatCalendarDay(schedule.end)
        }
    }
}
