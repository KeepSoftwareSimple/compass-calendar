import Foundation

public enum GridScrollMath {
    /// Matches web `SCROLL_TO_NOW_BUFFER_PX`.
    public static let scrollToNowBufferPx = 150.0
    public static let scrollTolerancePx = 2.0

    public static func minutesFromStartOfDay(referenceNow: Date, calendar: Calendar = EffectiveTimeZone.calendar) -> Double {
        let startOfDay = calendar.startOfDay(for: referenceNow)
        return referenceNow.timeIntervalSince(startOfDay) / 60
    }

    public static func scrollToNowDocumentY(
        referenceNow: Date,
        hourHeight: Double,
        allDayOffset: Double,
        calendar: Calendar = EffectiveTimeZone.calendar
    ) -> Double {
        let minutes = minutesFromStartOfDay(referenceNow: referenceNow, calendar: calendar)
        let nowLineY = (minutes / 60) * hourHeight + allDayOffset
        return max(0, nowLineY - scrollToNowBufferPx)
    }

    public static func isAtScrollTarget(currentY: Double, targetY: Double) -> Bool {
        abs(currentY - targetY) <= scrollTolerancePx
    }
}
