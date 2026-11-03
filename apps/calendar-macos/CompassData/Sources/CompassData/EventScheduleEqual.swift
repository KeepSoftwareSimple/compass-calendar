import CompassKit

enum EventScheduleEqual {
    static func matches(_ left: EventSchedule, _ right: EventSchedule) -> Bool {
        switch (left, right) {
        case (.allDay(let a), .allDay(let b)):
            return a.start == b.start && a.end == b.end
        case (.timed(let a), .timed(let b)):
            let leftStart = CompassDateParsing.parseInEffectiveTimeZone(a.start.rawValue)
            let rightStart = CompassDateParsing.parseInEffectiveTimeZone(b.start.rawValue)
            let leftEnd = CompassDateParsing.parseInEffectiveTimeZone(a.end.rawValue)
            let rightEnd = CompassDateParsing.parseInEffectiveTimeZone(b.end.rawValue)
            return leftStart == rightStart && leftEnd == rightEnd
        default:
            return false
        }
    }
}
