import Foundation

/// Mirrors `apps/calendar-web/src/shortcuts/quick-time/quick-time.util.ts`.
public enum QuickTime {
    public static let maxDigits = 4

    public static func canBufferGrow(_ digits: String) -> Bool {
        digits.count < maxDigits
    }

    public static func quickTimeTargetDay(
        startOfView: Date,
        endOfView: Date,
        now: Date,
        focusedDay: Date?
    ) -> Date {
        let calendar = EffectiveTimeZone.calendar
        if let focusedDay, dayIsInView(focusedDay, start: startOfView, end: endOfView) {
            return calendar.startOfDay(for: focusedDay)
        }
        if dayIsInView(now, start: startOfView, end: endOfView) {
            return calendar.startOfDay(for: now)
        }
        return calendar.startOfDay(for: startOfView)
    }

    public static func resolveQuickTimeStart(digits: String, targetDay: Date) -> Date? {
        guard digits.allSatisfy(\.isNumber), !digits.isEmpty, digits.count <= maxDigits else {
            return nil
        }
        guard let (hour, minute) = parseUserTimeDigits(digits) else { return nil }

        let calendar = EffectiveTimeZone.calendar
        let dayStart = calendar.startOfDay(for: targetDay)
        return calendar.date(bySettingHour: hour, minute: minute, second: 0, of: dayStart)
    }

    private static func dayIsInView(_ day: Date, start: Date, end: Date) -> Bool {
        let calendar = EffectiveTimeZone.calendar
        let normalized = calendar.startOfDay(for: day)
        let viewStart = calendar.startOfDay(for: start)
        let viewEnd = calendar.startOfDay(for: end)
        return normalized >= viewStart && normalized <= viewEnd
    }

    /// 24-hour clock from typed digits: "1130" is 11:30, "12" is noon.
    private static func parseUserTimeDigits(_ digits: String) -> (hour: Int, minute: Int)? {
        let padded: String
        switch digits.count {
        case 1, 2:
            padded = digits + "00"
        case 3:
            padded = "0" + digits
        case 4:
            padded = digits
        default:
            return nil
        }

        guard padded.count == 4,
            let hour = Int(padded.prefix(2)),
            let minute = Int(padded.suffix(2)),
            hour >= 0, hour < 24,
            minute >= 0, minute < 60
        else {
            return nil
        }
        return (hour, minute)
    }
}
