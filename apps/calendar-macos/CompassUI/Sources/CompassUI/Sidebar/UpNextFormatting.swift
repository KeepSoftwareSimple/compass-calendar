import CompassData
import CompassKit
import Foundation

/// One Up Next occurrence with its countdown already formatted, so the card
/// and the banner share the parse instead of each repeating it.
struct UpNextPresentation {
    let upNext: UpNextOccurrence
    let countdown: String
}

enum UpNextFormatting {
    /// `nil` when nothing is up next or its window does not parse, which both
    /// surfaces treat as having nothing to show.
    static func resolve(_ state: NativeUpNextState) -> UpNextPresentation? {
        guard let upNext = state.snapshot.upNext,
              let start = CompassDateParsing.parseInEffectiveTimeZone(upNext.startDate),
              let end = CompassDateParsing.parseInEffectiveTimeZone(upNext.endDate)
        else {
            return nil
        }
        return UpNextPresentation(
            upNext: upNext,
            countdown: formatEventStatus(
                start: start,
                end: end,
                now: state.referenceNow,
                isCurrentEvent: state.snapshot.isCurrentEvent))
    }

    static func formatStartsIn(start: Date, now: Date) -> String {
        let minutes = Int((start.timeIntervalSince(now) / 60).rounded())
        if minutes <= 0 { return "Starts now" }
        if minutes < 60 {
            return "Starts in \(minutes) minute\(minutes == 1 ? "" : "s")"
        }
        let hours = Int((Double(minutes) / 60.0).rounded())
        return "Starts in \(hours) hour\(hours == 1 ? "" : "s")"
    }

    static func formatEventStatus(start: Date, end: Date, now: Date, isCurrentEvent: Bool) -> String {
        if isCurrentEvent {
            let minutesRemaining = Int((end.timeIntervalSince(now) / 60).rounded())
            if minutesRemaining <= 0 { return "Ending now" }
            if minutesRemaining < 60 {
                return "Ends in \(minutesRemaining) minute\(minutesRemaining == 1 ? "" : "s")"
            }
            let hours = Int((Double(minutesRemaining) / 60.0).rounded())
            return "Ends in \(hours) hour\(hours == 1 ? "" : "s")"
        }
        return formatStartsIn(start: start, now: now)
    }
}
