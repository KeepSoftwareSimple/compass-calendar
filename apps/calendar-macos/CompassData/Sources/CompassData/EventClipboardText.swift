import CompassKit
import Foundation

public enum EventClipboardText {
    public static func format(event: Event) -> String {
        let title: String = {
            guard case .details(let details) = event.content else { return "Compass event" }
            let trimmed = details.title.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? "Untitled event" : trimmed
        }()

        switch event.schedule {
        case .timed(let timed):
            let formatter = DateFormatter()
            formatter.timeZone = TimeZone(identifier: timed.timeZone.id) ?? .current
            formatter.dateFormat = "EEE, MMM d"
            guard
                let start = CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue),
                let end = CompassDateParsing.parseInEffectiveTimeZone(timed.end.rawValue)
            else { return title }
            let day = formatter.string(from: start)
            formatter.dateFormat = "h:mm a"
            let range = "\(formatter.string(from: start)) – \(formatter.string(from: end))"
            return "\(title)\n\(day), \(range) (\(timed.timeZone.id))"
        case .allDay(let allDay):
            return "\(title)\nAll day, \(allDay.start) – \(allDay.end)"
        }
    }
}
