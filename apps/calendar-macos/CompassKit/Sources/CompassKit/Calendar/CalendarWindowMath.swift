import Foundation

public enum CalendarWindowMath {
    public static let weekDayCount = 7

    /// Web Day.js `startOf("week")`: Sunday 00:00 in the effective timezone.
    public static func sundayWeekViewStart(containing date: Date) -> Date {
        var calendar = EffectiveTimeZone.calendar
        calendar.firstWeekday = 1
        calendar.minimumDaysInFirstWeek = 1
        let startOfDay = calendar.startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: startOfDay)
        let daysFromSunday = (weekday - calendar.firstWeekday + 7) % 7
        return calendar.date(byAdding: .day, value: -daysFromSunday, to: startOfDay) ?? startOfDay
    }

    /// Seven local days from the anchor's start of day; `end` is exclusive next midnight.
    public static func weekEventsQueryWindow(anchor: Date) -> DateRange {
        let calendar = EffectiveTimeZone.calendar
        let startOfView = calendar.startOfDay(for: anchor)
        let endOfView =
            calendar.date(byAdding: .day, value: weekDayCount, to: startOfView) ?? startOfView
        return DateRange(start: startOfView, end: endOfView)
    }

    public static func weekEventQueryRange(anchor: Date) -> (startDate: String, endDate: String) {
        let window = weekEventsQueryWindow(anchor: anchor)
        return (window.startISO, window.endISO)
    }

    public static func dayEventQueryBounds(
        date: Date,
        timeZoneIdentifier: String? = nil
    ) -> (start: Date, end: Date) {
        let calendar: Calendar
        if let timeZoneIdentifier,
           let zone = TimeZone(identifier: timeZoneIdentifier)
        {
            var localized = Calendar(identifier: .gregorian)
            localized.timeZone = zone
            calendar = localized
        } else {
            calendar = EffectiveTimeZone.calendar
        }
        let startOfDay = calendar.startOfDay(for: date)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? startOfDay
        return (startOfDay, endOfDay)
    }

    /// One day's fetch window as `[startDate, endDate)` with exclusive upper bound.
    public static func dayEventQueryRange(
        date: Date,
        timeZoneIdentifier: String? = nil
    ) -> (startDate: String, endDate: String) {
        let bounds = dayEventQueryBounds(date: date, timeZoneIdentifier: timeZoneIdentifier)
        return (
            CompassDateParsing.formatLikeDayjs(bounds.start),
            CompassDateParsing.formatLikeDayjs(bounds.end)
        )
    }

    /// Today's local day plus long synced reminder lead into tomorrow (notifier and Up Next range).
    public static func notifiableEventQueryRange(now: Date) -> (startDate: String, endDate: String) {
        let calendar = EffectiveTimeZone.calendar
        let startOfDay = calendar.startOfDay(for: now)
        let endExclusive =
            calendar.date(
                byAdding: .minute,
                value: UpcomingNotifierLogic.maxNotificationLookaheadMinutes,
                to: calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? startOfDay)
            ?? startOfDay
        return (
            CompassDateParsing.formatLikeDayjs(startOfDay),
            CompassDateParsing.formatLikeDayjs(endExclusive)
        )
    }

    /// How many day columns fit in the week grid track (see `useVisibleDayCount`).
    public static func computeVisibleDayCount(
        trackWidth: Double,
        marginLeft: Double = Double(GridMetrics.gridMarginLeft)
    ) -> Int {
        let usable = trackWidth - marginLeft
        let raw = Int(floor(usable / Double(GridMetrics.dayColumnMinUsableWidth)))
        return min(max(raw, 1), weekDayCount)
    }

    public static func computeVisibleWindowOffset(
        anchorIndex: Int,
        visibleDayCount: Int
    ) -> Int {
        let maxOffset = max(weekDayCount - visibleDayCount, 0)
        let centered = anchorIndex - (visibleDayCount - 1) / 2
        return min(max(centered, 0), maxOffset)
    }

    public static func anchorDateForWindowOffset(
        weekStart: Date,
        windowOffset: Int,
        visibleDayCount: Int
    ) -> Date {
        let calendar = EffectiveTimeZone.calendar
        let centerOffset = windowOffset + (visibleDayCount - 1) / 2
        return calendar.date(byAdding: .day, value: centerOffset, to: weekStart) ?? weekStart
    }
}
