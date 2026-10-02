import Foundation

enum UpNextFormatting {
    static func formatStartsIn(start: Date, now: Date) -> String {
        let minutes = Int((start.timeIntervalSince(now) / 60).rounded())
        if minutes <= 0 { return "Starts now" }
        if minutes < 60 {
            return "Starts in \(minutes) minute\(minutes == 1 ? "" : "s")"
        }
        let hours = Int((minutes / 60.0).rounded())
        return "Starts in \(hours) hour\(hours == 1 ? "" : "s")"
    }

    static func formatEventStatus(start: Date, end: Date, now: Date, isCurrentEvent: Bool) -> String {
        if isCurrentEvent {
            let minutesRemaining = Int((end.timeIntervalSince(now) / 60).rounded())
            if minutesRemaining <= 0 { return "Ending now" }
            if minutesRemaining < 60 {
                return "Ends in \(minutesRemaining) minute\(minutesRemaining == 1 ? "" : "s")"
            }
            let hours = Int((minutesRemaining / 60.0).rounded())
            return "Ends in \(hours) hour\(hours == 1 ? "" : "s")"
        }
        return formatStartsIn(start: start, now: now)
    }
}
