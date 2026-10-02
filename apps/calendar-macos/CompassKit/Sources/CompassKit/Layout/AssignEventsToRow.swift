import Foundation

public struct GridEventRowInput: Sendable {
    public var id: String
    public var startDate: String
    public var endDate: String
    public var row: Int?
    public var title: String

    public init(id: String, startDate: String, endDate: String, row: Int? = nil, title: String) {
        self.id = id
        self.startDate = startDate
        self.endDate = endDate
        self.row = row
        self.title = title
    }
}

public struct GridEventRowOutput: Sendable {
    public var id: String
    public var startDate: String
    public var endDate: String
    public var row: Int
    public var title: String

    public init(id: String, startDate: String, endDate: String, row: Int, title: String) {
        self.id = id
        self.startDate = startDate
        self.endDate = endDate
        self.row = row
        self.title = title
    }
}

public enum AssignEventsToRow {
    public static func assign(
        allDayEvents: [GridEventRowInput]
    ) -> (rowsCount: Int, allDayEvents: [GridEventRowOutput]) {
        var rows: [[Int]] = []
        var ordered = allDayEvents

        for index in ordered.indices {
            let eventDays = eventDayNumbers(
                startDate: ordered[index].startDate,
                endDate: ordered[index].endDate
            )

            if index == 0 {
                rows.append(eventDays)
                ordered[index].row = 1
            } else {
                let assignment = assignEventToRow(eventDays: eventDays, rows: rows)
                if assignment.fits, let rowNum = assignment.rowNum {
                    rows[rowNum].append(contentsOf: eventDays)
                    ordered[index].row = rowNum + 1
                } else {
                    rows.append(eventDays)
                    ordered[index].row = rows.count
                }
            }
        }

        let outputs = ordered.map { event in
            GridEventRowOutput(
                id: event.id,
                startDate: event.startDate,
                endDate: event.endDate,
                row: event.row ?? 1,
                title: event.title
            )
        }

        return (rows.count, outputs)
    }

    private static func assignEventToRow(
        eventDays: [Int],
        rows: [[Int]]
    ) -> (fits: Bool, rowNum: Int?) {
        for rowIndex in rows.indices {
            if noOverlaps(eventDays, rows[rowIndex]) {
                return (true, rowIndex)
            }
        }
        return (false, nil)
    }

    private static func noOverlaps(_ left: [Int], _ right: [Int]) -> Bool {
        Set(left).isDisjoint(with: right)
    }

    private static func eventDayNumbers(startDate: String, endDate: String) -> [Int] {
        guard let start = CompassDateParsing.calendarDateInEffectiveTimeZone(startDate),
              let end = CompassDateParsing.calendarDateInEffectiveTimeZone(endDate)
        else {
            return []
        }

        let calendar = EffectiveTimeZone.calendar
        let startDay = calendar.ordinality(of: .day, in: .year, for: start) ?? 0
        let endDay = calendar.ordinality(of: .day, in: .year, for: end) ?? startDay
        var eventDays = range(start: startDay, end: endDay)
        if eventDays.count > 1 {
            eventDays.removeLast()
        }
        return eventDays
    }

    private static func range(start: Int, end: Int) -> [Int] {
        if end - start < 0 {
            let endYearChange = start + end
            return (start ... endYearChange).map { $0 }
        }
        return (start ... end).map { $0 }
    }
}
