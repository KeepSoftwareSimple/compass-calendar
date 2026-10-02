import Foundation

public struct EventNudgeMovement: Hashable, Sendable {
    public var days: Int
    public var minutes: Int

    public init(days: Int, minutes: Int) {
        self.days = days
        self.minutes = minutes
    }
}

public enum EventNudgeStep: String, Sendable {
    case fine
    case coarse
}

public enum DraftNudgeActivity: String, Sendable {
    case createShortcut
    case gridClick
    case keyboardEdit
    case keyboardPlace
    case eventRightClick
}

public struct DraftSchedule: Hashable, Sendable, Codable {
    public enum Kind: String, Sendable, Codable {
        case timed
        case allDay
    }

    public var start: Date
    public var end: Date
    public var kind: Kind

    public init(start: Date, end: Date, kind: Kind) {
        self.start = start
        self.end = end
        self.kind = kind
    }
}

public enum DraftNudge {
    private static let fineDayStep = 1
    private static let coarseDayStep = 7
    private static let coarseMinuteStep = 60

    public static func nudgeStepFromKeyboard(altKey: Bool) -> EventNudgeStep {
        altKey ? .coarse : .fine
    }

    public static func getArrowKeyMovement(
        key: String,
        isAllDay: Bool,
        step: EventNudgeStep = .fine
    ) -> EventNudgeMovement? {
        let days = step == .coarse ? coarseDayStep : fineDayStep
        let minutes = step == .coarse ? coarseMinuteStep : GridLayoutConstants.gridTimeStep

        switch key {
        case "ArrowLeft":
            return EventNudgeMovement(days: -days, minutes: 0)
        case "ArrowRight":
            return EventNudgeMovement(days: days, minutes: 0)
        case "ArrowUp":
            return isAllDay ? nil : EventNudgeMovement(days: 0, minutes: -minutes)
        case "ArrowDown":
            return isAllDay ? nil : EventNudgeMovement(days: 0, minutes: minutes)
        default:
            return nil
        }
    }

    public static func isTimedEventInsideOneDay(start: Date, end: Date) -> Bool {
        let calendar = EffectiveTimeZone.calendar
        let startOfDay = calendar.startOfDay(for: start)
        guard let midnightAfterStart = calendar.date(byAdding: .day, value: 1, to: startOfDay) else {
            return false
        }
        return calendar.isDate(end, inSameDayAs: start) || end == midnightAfterStart
    }

    public static func isTimedEventMultiDay(start: Date, end: Date) -> Bool {
        !isTimedEventInsideOneDay(start: start, end: end)
    }

    public static func isTimedEventFullCalendarDay(start: Date, end: Date) -> Bool {
        let calendar = EffectiveTimeZone.calendar
        let startOfDay = calendar.startOfDay(for: start)
        guard let nextMidnight = calendar.date(byAdding: .day, value: 1, to: startOfDay) else {
            return false
        }
        return calendar.isDate(start, equalTo: startOfDay, toGranularity: .minute)
            && calendar.isDate(end, equalTo: nextMidnight, toGranularity: .minute)
    }

    public static func shouldRenderTimedInAllDayRow(start: Date, end: Date) -> Bool {
        isTimedEventMultiDay(start: start, end: end)
            || isTimedEventFullCalendarDay(start: start, end: end)
    }

    public static func timedMultiDayToAllDayDates(
        start: Date,
        end: Date
    ) -> (startDate: String, endDate: String) {
        let calendar = EffectiveTimeZone.calendar
        let endDayStart = calendar.startOfDay(for: end)
        let exclusiveEnd: Date
        if calendar.isDate(end, equalTo: endDayStart, toGranularity: .minute) {
            exclusiveEnd = endDayStart
        } else if let next = calendar.date(byAdding: .day, value: 1, to: endDayStart) {
            exclusiveEnd = next
        } else {
            exclusiveEnd = endDayStart
        }

        return (
            CompassDateParsing.formatCalendarDay(calendar.startOfDay(for: start)),
            CompassDateParsing.formatCalendarDay(exclusiveEnd)
        )
    }

    public static func repositionDraftByKeyboard(
        activity: DraftNudgeActivity?,
        schedule: DraftSchedule?,
        key: String,
        isStartAllowed: ((Date) -> Bool)? = nil,
        step: EventNudgeStep = .fine
    ) -> DraftSchedule? {
        guard canRepositionDraftByKeyboard(activity: activity), let schedule else {
            return nil
        }

        let isAllDay = schedule.kind == .allDay
        guard let movement = getArrowKeyMovement(key: key, isAllDay: isAllDay, step: step) else {
            return nil
        }

        let calendar = EffectiveTimeZone.calendar
        var nextStart = calendar.date(byAdding: .day, value: movement.days, to: schedule.start)
            ?? schedule.start
        nextStart = calendar.date(byAdding: .minute, value: movement.minutes, to: nextStart)
            ?? nextStart
        var nextEnd = calendar.date(byAdding: .day, value: movement.days, to: schedule.end)
            ?? schedule.end
        nextEnd = calendar.date(byAdding: .minute, value: movement.minutes, to: nextEnd)
            ?? nextEnd

        if let isStartAllowed, !isStartAllowed(nextStart) {
            return nil
        }

        if !isAllDay, !isTimedEventInsideOneDay(start: nextStart, end: nextEnd) {
            return nil
        }

        return DraftSchedule(start: nextStart, end: nextEnd, kind: schedule.kind)
    }

    private static func canRepositionDraftByKeyboard(activity: DraftNudgeActivity?) -> Bool {
        switch activity {
        case .createShortcut, .gridClick, .keyboardEdit, .keyboardPlace:
            true
        default:
            false
        }
    }
}
