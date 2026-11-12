import XCTest
@testable import CompassKit

final class DayCalendarColumnsTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EffectiveTimeZone.identifier = "UTC"
        EffectiveTimeZone.calendarTimeZoneHint = nil
    }

    func testDayViewShowsOnlyCalendarsWithVisibleEvents() {
        let work = GridLayoutSnapshotFixtures.parityCalendars[0]
        let personal = GridLayoutSnapshotFixtures.parityCalendars[1]
        let scenario = GridLayoutScenario(
            allDayEvents: [
                GridLayoutAllDayEventInput(
                    calendarId: work.id,
                    endDate: "2026-05-22",
                    eventId: "all-day-span",
                    row: 1,
                    startDate: "2026-05-19",
                    title: "All-day span"
                ),
            ],
            calendars: [work, personal],
            defaultTargetCalendarId: work.id,
            hiddenEventIds: ["hidden-strip"],
            layoutMode: .day,
            referenceNow: GridLayoutSnapshotFixtures.referenceNow,
            timedEvents: [
                GridLayoutTimedEventInput(
                    calendarId: work.id,
                    endDate: "2026-05-20T10:00:00.000",
                    eventId: "overlap-a",
                    startDate: "2026-05-20T09:00:00.000",
                    title: "Overlap A"
                ),
                GridLayoutTimedEventInput(
                    calendarId: personal.id,
                    endDate: "2026-05-20T12:00:00.000",
                    eventId: "hidden-strip",
                    startDate: "2026-05-20T11:00:00.000",
                    title: "Hidden"
                ),
            ],
            visibleDateKeys: ["2026-05-20"]
        )

        let columns = scenario.dayViewCalendarsForLayout()
        XCTAssertEqual(columns.map(\.id), [work.id])
    }

    func testDayViewFallsBackToDefaultCalendarWhenDayIsEmpty() {
        let work = GridLayoutSnapshotFixtures.parityCalendars[0]
        let personal = GridLayoutSnapshotFixtures.parityCalendars[1]
        let columns = DayCalendarColumns.dayViewCalendars(
            [work, personal],
            dayKey: "2026-05-20",
            timedEvents: [],
            allDayEvents: [],
            hiddenEventIds: [],
            pinnedCalendarIds: [],
            defaultTargetCalendarId: work.id
        )
        XCTAssertEqual(columns.map(\.id), [work.id])
    }

    func testDayViewKeepsPinnedCalendarWithoutEvents() {
        let work = GridLayoutSnapshotFixtures.parityCalendars[0]
        let personal = GridLayoutSnapshotFixtures.parityCalendars[1]
        let columns = DayCalendarColumns.dayViewCalendars(
            [work, personal],
            dayKey: "2026-05-20",
            timedEvents: [],
            allDayEvents: [],
            hiddenEventIds: [],
            pinnedCalendarIds: [personal.id],
            defaultTargetCalendarId: work.id
        )
        XCTAssertEqual(columns.map(\.id), [personal.id])
    }

    func testDayViewKeepsBothColumnsAtMergeQueueUTCBoundary() throws {
        let denverCalendars = GridLayoutSnapshotFixtures.parityCalendars.map { calendar in
            CompassCalendar(
                access: calendar.access,
                accountEmail: calendar.accountEmail,
                backgroundColor: calendar.backgroundColor,
                capabilities: calendar.capabilities,
                conference: calendar.conference,
                createsGoogleMeet: calendar.createsGoogleMeet,
                description: calendar.description,
                foregroundColor: calendar.foregroundColor,
                id: calendar.id,
                isActive: calendar.isActive,
                isPrimary: calendar.isPrimary,
                isVisible: calendar.isVisible,
                name: calendar.name,
                provider: calendar.provider,
                timeZone: "America/Denver"
            )
        }
        let referenceNow = try XCTUnwrap(
            CompassDateParsing.parseGridDateTime(
                "2026-11-12T00:23:00.000",
                timeZoneIdentifier: "UTC"
            )
        )
        let work = denverCalendars[0]
        let personal = denverCalendars[1]
        let scenario = GridLayoutScenario(
            calendars: denverCalendars,
            layoutMode: .day,
            referenceNow: referenceNow,
            timedEvents: [
                GridLayoutTimedEventInput(
                    calendarId: work.id,
                    endDate: "2026-11-11T10:30:00.000",
                    eventId: "boundary-a",
                    startDate: "2026-11-11T09:00:00.000",
                    timeZone: "America/Denver",
                    title: "Morning"
                ),
                GridLayoutTimedEventInput(
                    calendarId: personal.id,
                    endDate: "2026-11-11T14:30:00.000",
                    eventId: "boundary-b",
                    startDate: "2026-11-11T13:00:00.000",
                    timeZone: "America/Denver",
                    title: "Afternoon"
                ),
            ],
            visibleDateKeys: ["2026-11-12"]
        )

        let columns = scenario.dayViewCalendarsForLayout()
        XCTAssertEqual(columns.map(\.name), ["Work", "Personal"])
    }
}
