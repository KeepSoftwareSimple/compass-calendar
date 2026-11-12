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
    case pastePlace
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
        case .createShortcut, .gridClick, .keyboardEdit, .keyboardPlace, .pastePlace:
            true
        default:
            false
        }
    }

    /// Start or end edge for Tab edge-focus and Shift+arrow edge nudges.
    public enum ScheduleEdge: Sendable, Hashable {
        case start
        case end
    }

    public struct ScheduleEdgeNudgeResult: Sendable, Hashable {
        public var schedule: DraftSchedule
        public var edge: ScheduleEdge

        public init(schedule: DraftSchedule, edge: ScheduleEdge) {
            self.schedule = schedule
            self.edge = edge
        }
    }

    /// Whole-event keyboard nudge without draft-activity gating (saved grid events).
    public static func nudgeScheduleByKeyboard(
        schedule: DraftSchedule,
        key: String,
        isStartAllowed: ((Date) -> Bool)? = nil,
        step: EventNudgeStep = .fine
    ) -> DraftSchedule? {
        let isAllDay = schedule.kind == .allDay
        guard let movement = getArrowKeyMovement(key: key, isAllDay: isAllDay, step: step) else {
            return nil
        }
        return applyWholeEventMovement(to: schedule, movement: movement, isStartAllowed: isStartAllowed)
    }

    /// Week view: refuse all-day edge moves that would leave the visible week
    /// (web `wouldAllDayEdgeLeaveVisibleWeek`).
    public static func wouldAllDayEdgeLeaveVisibleWeek(
        schedule: DraftSchedule,
        edge: ScheduleEdge,
        daysDelta: Int,
        visibleStart: Date,
        visibleEndInclusive: Date
    ) -> Bool {
        guard schedule.kind == .allDay, daysDelta != 0 else { return false }
        let calendar = EffectiveTimeZone.calendar
        let edgeDay: Date
        switch edge {
        case .start:
            edgeDay = calendar.startOfDay(for: schedule.start)
        case .end:
            guard let inclusiveEnd = calendar.date(byAdding: .day, value: -1, to: schedule.end) else {
                return false
            }
            edgeDay = calendar.startOfDay(for: inclusiveEnd)
        }
        guard let next = calendar.date(byAdding: .day, value: daysDelta, to: edgeDay) else {
            return false
        }
        let first = calendar.startOfDay(for: visibleStart)
        let last = calendar.startOfDay(for: visibleEndInclusive)
        return next < first || next > last
    }

    /// Single-edge keyboard nudge; mirrors web `nudgeEventEdgeDates`.
    public static func nudgeScheduleEdgeByKeyboard(
        schedule: DraftSchedule,
        edge: ScheduleEdge,
        key: String,
        step: EventNudgeStep = .fine,
        weekViewClamp: (visibleStart: Date, visibleEndInclusive: Date)? = nil
    ) -> ScheduleEdgeNudgeResult? {
        let isAllDay = schedule.kind == .allDay
        guard let movement = getArrowKeyMovement(key: key, isAllDay: isAllDay, step: step) else {
            return nil
        }
        if isAllDay {
            guard movement.days != 0 else { return nil }
            if let weekViewClamp,
               wouldAllDayEdgeLeaveVisibleWeek(
                schedule: schedule,
                edge: edge,
                daysDelta: movement.days,
                visibleStart: weekViewClamp.visibleStart,
                visibleEndInclusive: weekViewClamp.visibleEndInclusive
               )
            {
                return nil
            }
            return nudgeAllDayScheduleEdge(schedule: schedule, edge: edge, daysDelta: movement.days)
        }
        guard movement.minutes != 0 else { return nil }
        return nudgeTimedScheduleEdge(schedule: schedule, edge: edge, minutesDelta: movement.minutes)
    }

    private static func applyWholeEventMovement(
        to schedule: DraftSchedule,
        movement: EventNudgeMovement,
        isStartAllowed: ((Date) -> Bool)?
    ) -> DraftSchedule? {
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

        if schedule.kind == .timed, !isTimedEventInsideOneDay(start: nextStart, end: nextEnd) {
            return nil
        }

        return DraftSchedule(start: nextStart, end: nextEnd, kind: schedule.kind)
    }

    private static func nudgeTimedScheduleEdge(
        schedule: DraftSchedule,
        edge: ScheduleEdge,
        minutesDelta: Int
    ) -> ScheduleEdgeNudgeResult? {
        let step = GridLayoutConstants.gridTimeStep
        let start = schedule.start
        let end = schedule.end

        switch edge {
        case .start:
            let candidateStart = EffectiveTimeZone.calendar.date(
                byAdding: .minute,
                value: minutesDelta,
                to: start
            ) ?? start
            let latestStart = EffectiveTimeZone.calendar.date(byAdding: .minute, value: -step, to: end)
                ?? end

            if candidateStart <= latestStart {
                guard isTimedEventInsideOneDay(start: candidateStart, end: end) else { return nil }
                let next = DraftSchedule(start: candidateStart, end: end, kind: .timed)
                return ScheduleEdgeNudgeResult(schedule: next, edge: .start)
            }

            let flippedEnd = EffectiveTimeZone.calendar.date(byAdding: .minute, value: step, to: end) ?? end
            guard isTimedEventInsideOneDay(start: end, end: flippedEnd) else { return nil }
            let next = DraftSchedule(start: end, end: flippedEnd, kind: .timed)
            return ScheduleEdgeNudgeResult(schedule: next, edge: .end)

        case .end:
            let candidateEnd = EffectiveTimeZone.calendar.date(
                byAdding: .minute,
                value: minutesDelta,
                to: end
            ) ?? end
            let earliestEnd = EffectiveTimeZone.calendar.date(byAdding: .minute, value: step, to: start)
                ?? start

            if candidateEnd >= earliestEnd {
                guard isTimedEventInsideOneDay(start: start, end: candidateEnd) else { return nil }
                let next = DraftSchedule(start: start, end: candidateEnd, kind: .timed)
                return ScheduleEdgeNudgeResult(schedule: next, edge: .end)
            }

            let flippedStart = EffectiveTimeZone.calendar.date(byAdding: .minute, value: -step, to: start) ?? start
            guard isTimedEventInsideOneDay(start: flippedStart, end: start) else { return nil }
            let next = DraftSchedule(start: flippedStart, end: start, kind: .timed)
            return ScheduleEdgeNudgeResult(schedule: next, edge: .start)
        }
    }

    private static func nudgeAllDayScheduleEdge(
        schedule: DraftSchedule,
        edge: ScheduleEdge,
        daysDelta: Int
    ) -> ScheduleEdgeNudgeResult? {
        let calendar = EffectiveTimeZone.calendar
        let startDay = calendar.startOfDay(for: schedule.start)
        guard let inclusiveEnd = calendar.date(byAdding: .day, value: -1, to: schedule.end) else {
            return nil
        }
        let inclusiveEndDay = calendar.startOfDay(for: inclusiveEnd)

        switch edge {
        case .start:
            guard let candidate = calendar.date(byAdding: .day, value: daysDelta, to: startDay) else {
                return nil
            }
            let nextStart: Date
            let nextInclusiveEnd: Date
            let nextEdge: ScheduleEdge
            if candidate > inclusiveEndDay {
                nextStart = inclusiveEndDay
                nextInclusiveEnd = candidate
                nextEdge = .end
            } else {
                nextStart = candidate
                nextInclusiveEnd = inclusiveEndDay
                nextEdge = .start
            }
            guard let exclusiveEnd = calendar.date(byAdding: .day, value: 1, to: nextInclusiveEnd) else {
                return nil
            }
            let next = DraftSchedule(start: nextStart, end: exclusiveEnd, kind: .allDay)
            return ScheduleEdgeNudgeResult(schedule: next, edge: nextEdge)

        case .end:
            guard let candidate = calendar.date(byAdding: .day, value: daysDelta, to: inclusiveEndDay) else {
                return nil
            }
            let nextStart: Date
            let nextInclusiveEnd: Date
            let nextEdge: ScheduleEdge
            if candidate < startDay {
                nextStart = candidate
                nextInclusiveEnd = startDay
                nextEdge = .start
            } else {
                nextStart = startDay
                nextInclusiveEnd = candidate
                nextEdge = .end
            }
            guard let exclusiveEnd = calendar.date(byAdding: .day, value: 1, to: nextInclusiveEnd) else {
                return nil
            }
            let next = DraftSchedule(start: nextStart, end: exclusiveEnd, kind: .allDay)
            return ScheduleEdgeNudgeResult(schedule: next, edge: nextEdge)
        }
    }
}
