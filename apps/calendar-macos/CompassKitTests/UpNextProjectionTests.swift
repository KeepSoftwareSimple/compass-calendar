import CompassKit
import XCTest

final class UpNextProjectionTests: XCTestCase {
    private var priorTimeZone: String!

    override func setUp() {
        super.setUp()
        priorTimeZone = EffectiveTimeZone.identifier
        EffectiveTimeZone.identifier = "America/Denver"
    }

    override func tearDown() {
        EffectiveTimeZone.identifier = priorTimeZone
        super.tearDown()
    }

    func testFilterGridVisibleEventsDropsHiddenIdsAndCalendars() throws {
        let calendarOn = "507f1f77bcf86cd799439011"
        let calendarOff = "507f1f77bcf86cd799439012"
        let visible = try decodeTimedEvent(
            id: "visible",
            calendarId: calendarOn,
            start: "2026-03-10T10:00:00.000-06:00",
            end: "2026-03-10T11:00:00.000-06:00")
        let hiddenId = try decodeTimedEvent(
            id: "hidden-id",
            calendarId: calendarOn,
            start: "2026-03-10T10:00:00.000-06:00",
            end: "2026-03-10T11:00:00.000-06:00")
        let hiddenCal = try decodeTimedEvent(
            id: "other",
            calendarId: calendarOff,
            start: "2026-03-10T10:00:00.000-06:00",
            end: "2026-03-10T11:00:00.000-06:00")

        let filtered = UpNextProjection.filterGridVisibleEvents(
            [visible, hiddenId, hiddenCal],
            hiddenEventIds: ["hidden-id"],
            isCalendarVisible: { $0 == calendarOn })

        XCTAssertEqual(filtered.map(\.id.rawValue), ["visible"])
    }

    func testSnapshotUsesNextVisibleCurrentEventAfterHiddenFilteredOut() throws {
        let now = isoDate("2026-03-10T21:00:00.000Z")
        let calendarId = "507f1f77bcf86cd799439011"
        let hidden = try decodeTimedEvent(
            id: "hidden",
            calendarId: calendarId,
            title: "Flight",
            start: "2026-03-10T14:50:00.000-06:00",
            end: "2026-03-10T16:00:00.000-06:00")
        let visible = try decodeTimedEvent(
            id: "visible",
            calendarId: calendarId,
            title: "Write",
            start: "2026-03-10T14:55:00.000-06:00",
            end: "2026-03-10T16:30:00.000-06:00")

        let eligible = UpNextProjection.filterGridVisibleEvents(
            [hidden, visible],
            hiddenEventIds: ["hidden"],
            isCalendarVisible: { _ in true })
        let candidates = UpNextProjection.timedCandidates(from: eligible)
        let snapshot = UpNextProjection.snapshot(now: now, timedCandidates: candidates)

        XCTAssertEqual(snapshot.upNext?.title, "Write")
        XCTAssertTrue(snapshot.isCurrentEvent)
    }

    func testSnapshotEmptyWhenAllCandidatesFilteredOut() {
        let now = isoDate("2026-03-10T15:00:00.000Z")
        let snapshot = UpNextProjection.snapshot(now: now, timedCandidates: [])
        XCTAssertNil(snapshot.upNext)
        XCTAssertFalse(snapshot.isCurrentEvent)
    }

    func testNudgeWindowIncludesCurrentAndUpcomingWithinLeadMinutes() throws {
        let now = isoDate("2026-03-10T21:00:00.000Z")
        let calendarId = "507f1f77bcf86cd799439011"
        let current = try decodeTimedEvent(
            id: "current",
            calendarId: calendarId,
            title: "Now",
            start: "2026-03-10T14:50:00.000-06:00",
            end: "2026-03-10T16:00:00.000-06:00")
        let soon = try decodeTimedEvent(
            id: "soon",
            calendarId: calendarId,
            title: "Soon",
            start: "2026-03-10T15:01:00.000-06:00",
            end: "2026-03-10T15:31:00.000-06:00")
        let later = try decodeTimedEvent(
            id: "later",
            calendarId: calendarId,
            title: "Later",
            start: "2026-03-10T16:00:00.000-06:00",
            end: "2026-03-10T16:30:00.000-06:00")

        let candidates = UpNextProjection.timedCandidates(from: [current, soon, later])
        let window = UpNextProjection.nudgeWindow(now: now, timedCandidates: candidates)

        XCTAssertEqual(window.occurrences.map(\.id), ["current", "soon"])
        XCTAssertTrue(window.hasCurrentEvent)
    }

    private func decodeTimedEvent(
        id: String,
        calendarId: String,
        title: String = "Event",
        start: String,
        end: String
    ) throws -> Event {
        let json = """
        {
          "id": "\(id)",
          "calendarId": "\(calendarId)",
          "content": { "kind": "details", "title": "\(title)", "description": "" },
          "createdAt": "2026-06-10T15:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "timed",
            "start": "\(start)",
            "end": "\(end)",
            "timeZone": "\(EffectiveTimeZone.identifier)"
          }
        }
        """
        return try JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }

    private func isoDate(_ string: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: string)
            ?? ISO8601DateFormatter().date(from: string)!
    }
}
