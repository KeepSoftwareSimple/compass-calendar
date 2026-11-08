import CompassKit
import Foundation

extension EventEdge {
    var scheduleEdge: DraftNudge.ScheduleEdge {
        switch self {
        case .startDate: return .start
        case .endDate: return .end
        }
    }

    init(_ edge: DraftNudge.ScheduleEdge) {
        switch edge {
        case .start: self = .startDate
        case .end: self = .endDate
        }
    }
}

enum EventScheduleDraftMapping {
    static func eventSchedule(from draft: DraftSchedule, event: Event) -> EventSchedule {
        let timeZone: IANATimeZone? = {
            if case .timed(let timed) = event.schedule { return timed.timeZone }
            return nil
        }()
        switch draft.kind {
        case .timed:
            return .timed(
                EventSchedule_TimedPayload(
                    end: DateTime(rawValue: CompassDateParsing.formatLikeDayjs(draft.end)),
                    kind: "timed",
                    start: DateTime(rawValue: CompassDateParsing.formatLikeDayjs(draft.start)),
                    timeZone: timeZone ?? IANATimeZone(rawValue: EffectiveTimeZone.identifier)
                )
            )
        case .allDay:
            return .allDay(
                EventSchedule_AllDayPayload(
                    end: CompassDateParsing.formatCalendarDay(draft.end),
                    kind: "allDay",
                    start: CompassDateParsing.formatCalendarDay(draft.start)
                )
            )
        }
    }
}
