import CompassKit
import Foundation

enum EventMapping {
    private static let encoder = JSONEncoder()
    private static let decoder = JSONDecoder()

    static func event(from response: EventResponseEvent) throws -> Event {
        let data = try encoder.encode(response)
        return try decoder.decode(Event.self, from: data)
    }

    static func response(from event: Event) throws -> EventResponseEvent {
        let data = try encoder.encode(event)
        return try decoder.decode(EventResponseEvent.self, from: data)
    }
}
