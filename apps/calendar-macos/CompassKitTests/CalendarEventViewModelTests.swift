import CompassKit
import XCTest

final class CalendarEventViewModelTests: XCTestCase {
    func testTimedEventMapsToGridInput() throws {
        let json = """
        {
          "id": "evt-1",
          "calendarId": "507f1f77bcf86cd799439011",
          "content": { "kind": "details", "title": "Standup", "description": "" },
          "createdAt": "2026-06-10T15:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "timed",
            "start": "2026-06-10T09:00:00+00:00",
            "end": "2026-06-10T09:30:00+00:00",
            "timeZone": "UTC"
          }
        }
        """
        EffectiveTimeZone.identifier = "UTC"
        let event = try JSONDecoder().decode(Event.self, from: Data(json.utf8))
        let inputs = CalendarEventViewModel.gridInputs(from: [event])
        XCTAssertEqual(inputs.timedEvents.count, 1)
        XCTAssertEqual(inputs.timedEvents[0].title, "Standup")
    }
}
