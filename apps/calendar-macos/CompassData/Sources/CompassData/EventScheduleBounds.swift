import CompassKit
import Foundation

enum EventScheduleBounds {
    static func bounds(for event: Event) -> (startsAt: String, endsAt: String, allDay: Bool) {
        switch event.schedule {
        case .allDay(let payload):
            return (payload.start, payload.end, true)
        case .timed(let payload):
            return (payload.start.rawValue, payload.end.rawValue, false)
        }
    }

    static func intersectsQueryRange(event: Event, start: String, end: String) -> Bool {
        let bounds = bounds(for: event)
        return bounds.startsAt < end && bounds.endsAt > start
    }

    static func searchText(for event: Event) -> (title: String, description: String) {
        switch event.content {
        case .busy:
            return ("", "")
        case .details(let payload):
            return (payload.title, payload.description)
        }
    }
}
