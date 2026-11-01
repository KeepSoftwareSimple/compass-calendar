import Foundation

public struct EventPosition: Hashable, Sendable, Codable {
    public var height: Double
    public var left: Double
    public var top: Double
    public var width: Double
    public var zIndex: Int?

    public init(height: Double, left: Double, top: Double, width: Double, zIndex: Int? = nil) {
        self.height = height
        self.left = left
        self.top = top
        self.width = width
        self.zIndex = zIndex
    }
}

public struct GridVisibleDate: Hashable, Sendable {
    public var date: Date
    public var key: String

    public init(date: Date, key: String) {
        self.date = date
        self.key = key
    }

    public static func fromKeys(_ keys: [String]) -> [GridVisibleDate] {
        keys.compactMap { key in
            guard let date = CompassDateParsing.calendarDateInEffectiveTimeZone(key) else {
                return nil
            }
            return GridVisibleDate(date: date, key: key)
        }
    }
}

public enum EventPositionCalculator {
    public struct TimedEventInput: Sendable {
        public var startDate: String
        public var endDate: String
        public var timeZone: String?
        public var widthMultiplier: Double
        public var isDraft: Bool

        public init(
            startDate: String,
            endDate: String,
            timeZone: String? = nil,
            widthMultiplier: Double = 1,
            isDraft: Bool = false
        ) {
            self.startDate = startDate
            self.endDate = endDate
            self.timeZone = timeZone
            self.widthMultiplier = widthMultiplier
            self.isDraft = isDraft
        }
    }

    public static func getTimedEventPosition(
        _ input: TimedEventInput,
        measurements: GridMetrics,
        visibleDates: [GridVisibleDate],
        columnIndex: Int? = nil,
        hasSecondaryTimeZone: Bool = false
    ) -> EventPosition {
        guard let slot = resolveTimedSlot(
            startDate: input.startDate,
            endDate: input.endDate,
            eventTimeZone: input.timeZone,
            measurements: measurements,
            visibleDates: visibleDates,
            columnIndex: columnIndex,
            hasSecondaryTimeZone: hasSecondaryTimeZone
        ) else {
            return zeroPosition()
        }

        let durationMinutes = max(15, slot.durationMinutes)
        let widthMultiplier = input.isDraft ? 1 : input.widthMultiplier

        return EventPosition(
            height: (Double(durationMinutes) / 60) * measurements.hourHeight
                - GridLayoutConstants.draftPaddingBottom,
            left: slot.left,
            top: slot.top,
            width: max(
                0,
                slot.columnWidth * widthMultiplier - GridLayoutConstants.timedEventColumnInset * 2
            )
        )
    }

    public static func getBusyPeriodPosition(
        segmentStart: String,
        segmentEnd: String,
        measurements: GridMetrics,
        visibleDates: [GridVisibleDate],
        columnIndex: Int? = nil,
        hasSecondaryTimeZone: Bool = false
    ) -> EventPosition {
        guard let slot = resolveTimedSlot(
            startDate: segmentStart,
            endDate: segmentEnd,
            measurements: measurements,
            visibleDates: visibleDates,
            columnIndex: columnIndex,
            hasSecondaryTimeZone: hasSecondaryTimeZone
        ) else {
            return zeroPosition()
        }

        let durationMinutes = max(1, slot.durationMinutes)

        return EventPosition(
            height: (Double(durationMinutes) / 60) * measurements.hourHeight,
            left: slot.left,
            top: slot.top,
            width: max(0, slot.columnWidth - GridLayoutConstants.timedEventColumnInset * 2)
        )
    }

    /// Where one timed range lands in the grid: the column it occupies, the
    /// offset from midnight, and its raw length. Events and busy periods
    /// differ only in the minimum duration they clamp to and how they turn
    /// `columnWidth` into a rendered width.
    private struct TimedSlot {
        var columnWidth: Double
        var left: Double
        var top: Double
        var durationMinutes: Int
    }

    /// `nil` when either bound fails to parse or the start day is off screen,
    /// which both callers render as `zeroPosition()`.
    private static func resolveTimedSlot(
        startDate: String,
        endDate: String,
        eventTimeZone: String? = nil,
        measurements: GridMetrics,
        visibleDates: [GridVisibleDate],
        columnIndex: Int?,
        hasSecondaryTimeZone: Bool
    ) -> TimedSlot? {
        let parseZone = eventTimeZone ?? EffectiveTimeZone.identifier
        guard let start = CompassDateParsing.parseGridDateTime(
            startDate, timeZoneIdentifier: parseZone),
            let end = CompassDateParsing.parseGridDateTime(
                endDate, timeZoneIdentifier: parseZone)
        else {
            return nil
        }

        guard let dateIndex = columnIndex
            ?? getVisibleDateIndex(for: start, visibleDates: visibleDates)
        else {
            return nil
        }

        let columnLeft = GridMetrics.sumWidthsBefore(measurements.colWidths, dateIndex: dateIndex)
        let columnWidth = measurements.colWidths.indices.contains(dateIndex)
            ? measurements.colWidths[dateIndex]
            : 0
        let timeZone = EffectiveTimeZone.timeZone
        let minutesFromStartOfDay = CivilDay.gridMinutesFromCivilMidnight(start, timeZone: timeZone)

        return TimedSlot(
            columnWidth: columnWidth,
            left: GridMetrics.gridMarginLeftPx(hasSecondaryTimeZone: hasSecondaryTimeZone)
                + columnLeft + GridLayoutConstants.timedEventColumnInset,
            top: GridTimeConstants.timedGridTopPx(
                minutesFromCivilMidnight: minutesFromStartOfDay,
                hourHeight: measurements.hourHeight
            ),
            durationMinutes: minuteDiff(from: start, to: end)
        )
    }

    public static func getAllDayEventPosition(
        startDate: String,
        endDate: String,
        row: Int?,
        measurements: GridMetrics,
        visibleDates: [GridVisibleDate],
        columnIndex: Int? = nil
    ) -> EventPosition {
        let left: Double
        let width: Double

        if let columnIndex {
            let columnWidth = measurements.colWidths.indices.contains(columnIndex)
                ? measurements.colWidths[columnIndex]
                : 0
            left = GridMetrics.sumWidthsBefore(measurements.colWidths, dateIndex: columnIndex)
            width = widthMinusPadding(columnWidth)
        } else {
            guard let span = getVisibleAllDaySpan(
                startDate: startDate,
                endDate: endDate,
                visibleDates: visibleDates
            ) else {
                return zeroPosition()
            }

            guard let startIndex = getVisibleDateIndex(for: span.start, visibleDates: visibleDates),
                  let endIndex = getVisibleDateIndex(for: span.end, visibleDates: visibleDates)
            else {
                return zeroPosition()
            }

            left = GridMetrics.sumWidthsBefore(measurements.colWidths, dateIndex: startIndex)
            width = widthMinusPadding(
                GridMetrics.sumWidthsBetween(
                    measurements.colWidths,
                    startIndex: startIndex,
                    endIndex: endIndex
                )
            )
        }

        return EventPosition(
            height: GridLayoutConstants.eventAllDayHeight,
            left: left,
            top: allDayEventTop(row: row),
            width: width
        )
    }

    private static func allDayEventTop(row: Int?) -> Double {
        GridLayoutConstants.eventAllDayGap
            + GridLayoutConstants.eventAllDayRowHeight * Double((row ?? 1) - 1)
    }

    private static func getVisibleAllDaySpan(
        startDate: String,
        endDate: String,
        visibleDates: [GridVisibleDate]
    ) -> (start: Date, end: Date)? {
        guard let visibleStart = visibleDates.first?.date else {
            return nil
        }
        let visibleEnd = visibleDates.last?.date ?? visibleStart

        let eventStartKey = calendarDayKey(
            CompassDateParsing.calendarDateInEffectiveTimeZone(startDate) ?? visibleStart
        )
        let exclusiveEndKey = calendarDayKey(
            CompassDateParsing.calendarDateInEffectiveTimeZone(endDate) ?? visibleStart
        )
        let eventEndKey: String
        if exclusiveEndKey > eventStartKey,
           let exclusiveEnd = CompassDateParsing.calendarDateInEffectiveTimeZone(endDate),
           let previous = EffectiveTimeZone.calendar.date(byAdding: .day, value: -1, to: exclusiveEnd)
        {
            eventEndKey = calendarDayKey(previous)
        } else {
            eventEndKey = eventStartKey
        }

        let visibleStartKey = calendarDayKey(visibleStart)
        let visibleEndKey = calendarDayKey(visibleEnd)

        if eventEndKey < visibleStartKey || eventStartKey > visibleEndKey {
            return nil
        }

        let startKey = eventStartKey < visibleStartKey ? visibleStartKey : eventStartKey
        let endKey = eventEndKey > visibleEndKey ? visibleEndKey : eventEndKey

        guard let start = visibleDates.first(where: { calendarDayKey($0.date) == startKey })?.date,
              let end = visibleDates.first(where: { calendarDayKey($0.date) == endKey })?.date
        else {
            return nil
        }

        return (start, end)
    }

    private static func calendarDayKey(_ date: Date) -> String {
        CompassDateParsing.formatCalendarDay(date)
    }

    private static func getVisibleDateIndex(
        for date: Date,
        visibleDates: [GridVisibleDate]
    ) -> Int? {
        guard !visibleDates.isEmpty else { return nil }
        let eventDay = calendarDayKey(date)
        if let index = visibleDates.firstIndex(where: { calendarDayKey($0.date) == eventDay }) {
            return index
        }
        return nil
    }

    private static func widthMinusPadding(_ width: Double) -> Double {
        let adjusted = width - GridLayoutConstants.eventPaddingRight
        return adjusted < 0 ? width : adjusted
    }

    private static func zeroPosition() -> EventPosition {
        EventPosition(height: 0, left: 0, top: 0, width: 0)
    }

    private static func minuteDiff(from start: Date, to end: Date) -> Int {
        Int(floor(end.timeIntervalSince(start) / 60))
    }
}
