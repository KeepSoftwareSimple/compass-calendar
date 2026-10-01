import CompassKit
import XCTest

final class DesktopAgendaFormatterTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func instant(
        _ value: String,
        file: StaticString = #file,
        line: UInt = #line
    ) -> Date {
        guard let date = DesktopAgendaFormatter.parseInstant(value) else {
            XCTFail("invalid instant: \(value)", file: file, line: line)
            return Date(timeIntervalSince1970: 0)
        }
        return date
    }

    func testRelativeLeadMinutes() {
        let now = instant("2026-10-01T14:00:00.000Z")
        let start = instant("2026-10-01T14:12:00.000Z")
        XCTAssertEqual(DesktopAgendaFormatter.relativeLeadMinutes(from: now, to: start), "in 12m")
    }

    func testTruncatesLongTitles() {
        let title = String(repeating: "A", count: 40)
        let truncated = DesktopAgendaFormatter.truncate(title, maxLength: 10)
        XCTAssertEqual(truncated.count, 10)
        XCTAssertTrue(truncated.hasSuffix("…"))
    }

    func testEmptyAgendaShowsNothingElseToday() {
        let now = instant("2026-10-01T14:00:00.000Z")
        let presentation = DesktopAgendaFormatter.presentation(
            items: [],
            now: now,
            calendar: calendar)
        XCTAssertEqual(presentation.statusBarTitle, "Nothing else today")
        XCTAssertNil(presentation.dockBadgeLabel)
        XCTAssertEqual(presentation.menuEntries.count, 1)
        XCTAssertEqual(presentation.menuEntries[0].kind, .emptyState)
    }

    func testDockBadgeCountsUpcomingEventsToday() {
        let now = instant("2026-10-01T14:00:00.000Z")
        let items = [
            DesktopAgendaItem(
                id: "past",
                title: "Past",
                startsAt: "2026-10-01T12:00:00.000Z",
                endsAt: "2026-10-01T13:00:00.000Z"),
            DesktopAgendaItem(
                id: "next",
                title: "Standup",
                startsAt: "2026-10-01T14:12:00.000Z",
                endsAt: "2026-10-01T14:30:00.000Z"),
            DesktopAgendaItem(
                id: "later",
                title: "Review",
                startsAt: "2026-10-01T16:00:00.000Z",
                endsAt: "2026-10-01T17:00:00.000Z"),
        ]
        let presentation = DesktopAgendaFormatter.presentation(
            items: items,
            now: now,
            calendar: calendar)
        XCTAssertEqual(presentation.dockBadgeLabel, "2")
        XCTAssertEqual(presentation.statusBarTitle, "Next: Standup in 12m")
    }

    func testPastEventsMarkedInMenu() {
        let now = instant("2026-10-01T15:00:00.000Z")
        let items = [
            DesktopAgendaItem(
                id: "past",
                title: "Morning",
                startsAt: "2026-10-01T09:00:00.000Z",
                endsAt: "2026-10-01T10:00:00.000Z"),
        ]
        let presentation = DesktopAgendaFormatter.presentation(
            items: items,
            now: now,
            calendar: calendar)
        guard case let .event(_, label) = presentation.menuEntries[0].kind else {
            return XCTFail("expected event row")
        }
        XCTAssertTrue(label.contains("(ended)"))
        XCTAssertEqual(presentation.statusBarTitle, "Nothing else today")
    }

    func testMidnightRolloverDropsYesterday() {
        let now = instant("2026-10-02T00:30:00.000Z")
        let items = [
            DesktopAgendaItem(
                id: "yesterday",
                title: "Late",
                startsAt: "2026-10-01T23:00:00.000Z",
                endsAt: "2026-10-01T23:30:00.000Z"),
            DesktopAgendaItem(
                id: "today",
                title: "Breakfast",
                startsAt: "2026-10-02T08:00:00.000Z",
                endsAt: "2026-10-02T09:00:00.000Z"),
        ]
        let presentation = DesktopAgendaFormatter.presentation(
            items: items,
            now: now,
            calendar: calendar)
        XCTAssertEqual(presentation.dockBadgeLabel, "1")
        XCTAssertEqual(presentation.menuEntries.count, 1)
        guard case let .event(eventId, _) = presentation.menuEntries[0].kind else {
            return XCTFail("expected one today row")
        }
        XCTAssertEqual(eventId, "today")
    }
}
