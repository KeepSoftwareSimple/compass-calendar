import Foundation

/// Wall-clock hour labels for `displayTimeZone` at each effective-zone hour line.
public enum MappedHourLabels {
    public static func labels(
        effectiveTimeZone: String,
        displayTimeZone: String,
        at referenceDate: Date
    ) -> [String] {
        var calendar = Calendar(identifier: .gregorian)
        guard
            let effectiveZone = TimeZone(identifier: effectiveTimeZone),
            let displayZone = TimeZone(identifier: displayTimeZone)
        else {
            return []
        }
        calendar.timeZone = effectiveZone
        let startOfDay = calendar.startOfDay(for: referenceDate)
        let formatter = DateFormatter()
        formatter.timeZone = displayZone
        formatter.dateFormat = "h a"

        return (1 ... 23).compactMap { hourOffset in
            guard let instant = calendar.date(byAdding: .hour, value: hourOffset, to: startOfDay) else {
                return nil
            }
            var displayCalendar = calendar
            displayCalendar.timeZone = displayZone
            let minute = displayCalendar.component(.minute, from: instant)
            if minute == 0 {
                return formatter.string(from: instant)
            }
            formatter.dateFormat = "h:mm a"
            let label = formatter.string(from: instant)
            formatter.dateFormat = "h a"
            return label
        }
    }
}
