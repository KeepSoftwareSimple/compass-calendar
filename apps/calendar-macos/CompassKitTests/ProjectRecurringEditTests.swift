import CompassKit
import XCTest

final class ProjectRecurringEditTests: XCTestCase {
    private let seriesId = EventId(rawValue: "series-master-id")

    func testThisAndFollowingSplitRemovesStaleOccurrenceIds() throws {
        EffectiveTimeZone.identifier = "UTC"
        let master = try seriesBase()
        let events = try [occurrence(day: 5), occurrence(day: 6), occurrence(day: 7)]
        let original = events[1]
        let edited = copyEvent(
            original,
            content: .details(
                .init(description: "", kind: "details", title: "Write & schedule newsletter")
            ),
            schedule: .timed(
                .init(
                    end: .init(rawValue: "2026-07-06T17:00:00.000Z"),
                    kind: "timed",
                    start: .init(rawValue: "2026-07-06T16:00:00.000Z"),
                    timeZone: "UTC"
                )
            )
        )

        let projection = ProjectRecurringEdit.projectRecurringEdit(
            .init(
                scope: .thisAndFollowing,
                edited: edited,
                original: original,
                seriesEvents: events,
                seriesMaster: master
            )
        )

        XCTAssertEqual(projection.removeIds, Set([events[1].id.rawValue, events[2].id.rawValue]))
        XCTAssertEqual(projection.upserts[0].id, seriesId)
        XCTAssertEqual(projection.upserts[1].id, edited.id)
        if case .series = projection.upserts[1].recurrence {
            // expected remainder master
        } else {
            XCTFail("expected remainder series master")
        }

        var cache = [master] + events
        cache = applyProjection(to: cache, projection: projection)
        let slotCount = cache.filter { event in
            guard case .timed(let payload) = event.schedule else { return false }
            return payload.start.rawValue.hasPrefix("2026-07-06T16:00:00")
        }.count
        XCTAssertEqual(slotCount, 1)
    }

    private func applyProjection(to events: [Event], projection: RecurringEditProjection) -> [Event] {
        var byId = Dictionary(uniqueKeysWithValues: events.map { ($0.id.rawValue, $0) })
        for id in projection.removeIds {
            byId.removeValue(forKey: id)
        }
        for event in projection.upserts {
            byId[event.id.rawValue] = event
        }
        return Array(byId.values)
    }

    private func seriesBase() throws -> Event {
        let json = """
        {
          "id": "\(seriesId.rawValue)",
          "calendarId": "cal-1",
          "content": { "kind": "details", "title": "Newsletter", "description": "" },
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "series", "rules": ["RRULE:FREQ=WEEKLY"] },
          "schedule": {
            "kind": "timed",
            "start": "2026-07-01T16:00:00.000Z",
            "end": "2026-07-01T17:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }

    private func occurrence(day: Int) throws -> Event {
        let id = "\(seriesId.rawValue)|2026-07-\(String(format: "%02d", day))T16:00:00.000Z"
        let json = """
        {
          "id": "\(id)",
          "calendarId": "cal-1",
          "content": { "kind": "details", "title": "Newsletter", "description": "" },
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "occurrence", "seriesId": "\(seriesId.rawValue)" },
          "schedule": {
            "kind": "timed",
            "start": "2026-07-\(String(format: "%02d", day))T16:00:00.000Z",
            "end": "2026-07-\(String(format: "%02d", day))T17:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }

    private func copyEvent(
        _ event: Event,
        content: EventContent? = nil,
        schedule: EventSchedule? = nil
    ) -> Event {
        Event(
            calendarId: event.calendarId,
            content: content ?? event.content,
            createdAt: event.createdAt,
            icalUid: event.icalUid,
            id: event.id,
            providerManaged: event.providerManaged,
            recurrence: event.recurrence,
            schedule: schedule ?? event.schedule,
            updatedAt: event.updatedAt
        )
    }
}
