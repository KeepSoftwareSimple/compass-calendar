import Foundation

/// Mirrors `apps/calendar-web/src/common/utils/draft/draft.util.ts`.
public enum DraftTiming {
    public static func timedDraftEnd(start: Date) -> Date {
        let calendar = EffectiveTimeZone.calendar
        let startOfDay = calendar.startOfDay(for: start)
        guard let midnightAfterStart = calendar.date(byAdding: .day, value: 1, to: startOfDay) else {
            return start.addingTimeInterval(3600)
        }
        let oneHourEnd = start.addingTimeInterval(3600)
        return oneHourEnd > midnightAfterStart ? midnightAfterStart : oneHourEnd
    }

    public static func getDraftTimes(targetDay: Date, now: Date) -> (start: Date, end: Date) {
        let calendar = EffectiveTimeZone.calendar
        let dayStart = calendar.startOfDay(for: targetDay)
        var hour = calendar.component(.hour, from: now)
        var minute = calendar.component(.minute, from: now)
        let step = GridLayoutConstants.gridTimeStep
        minute = roundToNext(minute, step: step)

        var start = calendar.date(
            bySettingHour: hour,
            minute: minute,
            second: 0,
            of: dayStart
        ) ?? dayStart

        if !calendar.isDate(start, inSameDayAs: targetDay) {
            start = calendar.date(
                bySettingHour: 23,
                minute: 60 - step,
                second: 0,
                of: dayStart
            ) ?? dayStart
        }

        let end = timedDraftEnd(start: start)
        return (start, end)
    }

    private static func roundToNext(_ value: Int, step: Int) -> Int {
        guard step > 0 else { return value }
        let remainder = value % step
        if remainder == 0 { return value }
        return value + (step - remainder)
    }
}
