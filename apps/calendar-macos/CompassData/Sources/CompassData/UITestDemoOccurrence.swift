import CompassKit
import Foundation

/// Extra demo fixture row for XCUITest recurrence-scope flows only.
enum UITestDemoOccurrence {
    static let eventId = "demo-weekly-occurrence"
    static let seriesId = "demo-weekly-series"

    static func localRecord(calendarId: String) throws -> LocalEventRecord {
        let json = """
        {
          "id": "\(eventId)",
          "calendarId": "\(calendarId)",
          "content": { "kind": "details", "title": "Weekly sync", "description": "" },
          "createdAt": "2026-06-10T15:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "occurrence", "seriesId": "\(seriesId)" },
          "schedule": {
            "kind": "timed",
            "start": "2026-06-10T14:00:00+00:00",
            "end": "2026-06-10T15:00:00+00:00",
            "timeZone": "UTC"
          }
        }
        """
        let event = try JSONDecoder().decode(Event.self, from: Data(json.utf8))
        return LocalEventRecord(id: EventId(rawValue: eventId), event: event, isDemo: true)
    }
}
