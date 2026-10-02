import CompassKit
import XCTest

final class UpcomingNotifierLogicTests: XCTestCase {
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

    private func eventAt(minutesFromNow: Int, id: String? = nil) -> NotifiableEvent {
        let now = isoDate("2026-03-10T09:00:00.000Z")
        let start = Calendar.current.date(byAdding: .minute, value: minutesFromNow, to: now)!
        return NotifiableEvent(
            id: id ?? "e\(minutesFromNow)",
            title: "Event \(id ?? "e\(minutesFromNow)")",
            startDate: isoString(start))
    }

    func testSelectEventsInsideLeadWindow() {
        let now = isoDate("2026-03-10T09:00:00.000Z")
        let events = [eventAt(minutesFromNow: 0), eventAt(minutesFromNow: 5)]
        let due = UpcomingNotifierLogic.selectEventsToNotify(now: now, events: events, firedKeys: [])
        XCTAssertEqual(due.map(\.id), ["e0", "e5"])
    }

    func testSkipsAlreadyStartedEvents() {
        let now = isoDate("2026-03-10T09:00:00.000Z")
        let due = UpcomingNotifierLogic.selectEventsToNotify(
            now: now,
            events: [eventAt(minutesFromNow: -1)],
            firedKeys: [])
        XCTAssertTrue(due.isEmpty)
    }

    func testDedupesByNotificationKey() {
        let now = isoDate("2026-03-10T09:00:00.000Z")
        let event = eventAt(minutesFromNow: 3)
        let due = UpcomingNotifierLogic.selectEventsToNotify(
            now: now,
            events: [event],
            firedKeys: [UpcomingNotifierLogic.notificationKey(for: event)])
        XCTAssertTrue(due.isEmpty)
    }

    func testToNotifiableEventsSkipsDemo() {
        let candidate = UpcomingNotifierLogic.TimedCandidate(
            id: "demo-1",
            title: "Sample",
            startDate: "2026-03-10T10:00:00.000Z",
            endDate: "2026-03-10T11:00:00.000Z",
            isDemo: true)
        XCTAssertTrue(UpcomingNotifierLogic.toNotifiableEvents([candidate]).isEmpty)
    }

    func testNotificationBodyUsesEffectiveTimeZone() {
        let event = NotifiableEvent(
            id: "standup",
            title: "Standup",
            startDate: "2026-03-10T09:03:00.000Z")
        let payload = UpcomingNotifierLogic.notificationPayload(for: event)
        XCTAssertEqual(payload.body, "Starts at 3:03 AM")
    }

    func testNotifiableEventQueryRangeIncludesLeadIntoTomorrow() {
        EffectiveTimeZone.identifier = "America/Denver"
        let now = isoDate("2026-07-17T05:56:00.000Z")
        let range = CalendarWindowMath.notifiableEventQueryRange(now: now)
        guard let start = CompassDateParsing.parseInEffectiveTimeZone(range.startDate),
              let end = CompassDateParsing.parseInEffectiveTimeZone(range.endDate)
        else {
            return XCTFail("range not parseable")
        }
        let evening = isoDate("2026-07-17T03:00:00.000Z")
        let justAfterMidnight = isoDate("2026-07-17T06:03:00.000Z")
        let afterLead = isoDate("2026-07-17T06:06:00.000Z")
        XCTAssertGreaterThanOrEqual(evening, start)
        XCTAssertLessThan(evening, end)
        XCTAssertGreaterThanOrEqual(justAfterMidnight, start)
        XCTAssertLessThan(justAfterMidnight, end)
        XCTAssertGreaterThanOrEqual(afterLead, end)
    }

    private func isoDate(_ value: String) -> Date {
        guard let date = CompassDateParsing.parseInEffectiveTimeZone(value) else {
            XCTFail("unparseable date: \(value)")
            return Date()
        }
        return date
    }

    private func isoString(_ date: Date) -> String {
        CompassDateParsing.formatISO8601UTC(date)
    }
}
