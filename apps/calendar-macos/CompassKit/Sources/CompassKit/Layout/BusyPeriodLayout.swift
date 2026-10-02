import Foundation

public struct BusyPeriodDaySegment: Hashable, Sendable, Codable {
    public var calendarId: String
    public var end: String
    public var key: String
    public var start: String

    public init(calendarId: String, end: String, key: String, start: String) {
        self.calendarId = calendarId
        self.end = end
        self.key = key
        self.start = start
    }
}

public struct BusyPeriodInput: Hashable, Sendable {
    public var calendarId: String
    public var start: String
    public var end: String

    public init(calendarId: String, start: String, end: String) {
        self.calendarId = calendarId
        self.start = start
        self.end = end
    }
}

public enum BusyPeriodLayout {
    public static func splitBusyPeriodsByDay(
        busyPeriods: [BusyPeriodInput],
        visibleDates: [GridVisibleDate]
    ) -> [BusyPeriodDaySegment] {
        var segments: [BusyPeriodDaySegment] = []

        for period in busyPeriods {
            guard let periodStart = CompassDateParsing.parseInEffectiveTimeZone(period.start),
                  let periodEnd = CompassDateParsing.parseInEffectiveTimeZone(period.end)
            else {
                continue
            }

            let calendar = EffectiveTimeZone.calendar

            for visible in visibleDates {
                let dayStart = calendar.startOfDay(for: visible.date)
                guard let nextDayStart = calendar.date(byAdding: .day, value: 1, to: dayStart) else {
                    continue
                }
                let dayEnd = nextDayStart.addingTimeInterval(-0.001)

                let overlapsDay = periodStart < dayEnd && periodEnd > dayStart
                guard overlapsDay else { continue }

                let segmentStart = periodStart > dayStart ? periodStart : dayStart
                let segmentEnd = periodEnd < dayEnd ? periodEnd : dayEnd
                guard segmentEnd > segmentStart else { continue }

                segments.append(
                    BusyPeriodDaySegment(
                        calendarId: period.calendarId,
                        end: CompassDateParsing.formatLikeDayjs(segmentEnd),
                        key: "\(period.calendarId)-\(period.start)-\(period.end)-\(visible.key)",
                        start: CompassDateParsing.formatLikeDayjs(segmentStart)
                    )
                )
            }
        }

        return segments
    }
}
