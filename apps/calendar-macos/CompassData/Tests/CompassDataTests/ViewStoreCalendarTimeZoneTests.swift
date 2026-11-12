import CompassData
import CompassKit
import XCTest

@MainActor
final class ViewStoreCalendarTimeZoneTests: XCTestCase {
    func testCalendarHintBetweenPinAndBrowserLikeWeb() {
        let viewStore = ViewStore(browserTimeZone: "UTC")
        viewStore.setCalendarTimeZoneHint("America/Denver")
        XCTAssertEqual(viewStore.effectiveTimeZone, "America/Denver")
        XCTAssertEqual(EffectiveTimeZone.identifier, "America/Denver")
    }

    func testPinWinsOverCalendarHint() {
        let viewStore = ViewStore(browserTimeZone: "UTC")
        viewStore.setCalendarTimeZoneHint("America/Denver")
        XCTAssertTrue(viewStore.setPinnedTimeZone("America/Chicago"))
        XCTAssertEqual(viewStore.effectiveTimeZone, "America/Chicago")
        XCTAssertEqual(EffectiveTimeZone.identifier, "America/Chicago")
    }

    func testDayFetchWindowAndColumnsAtUtcMidnightBoundary() throws {
        let viewStore = ViewStore(browserTimeZone: "UTC")
        viewStore.setCalendarTimeZoneHint("America/Denver")
        let referenceNow = try XCTUnwrap(
            CompassDateParsing.parseGridDateTime(
                "2026-11-12T00:23:00.000",
                timeZoneIdentifier: "UTC"
            )
        )
        let startOfView = EffectiveTimeZone.calendar.startOfDay(for: referenceNow)
        XCTAssertEqual(CompassDateParsing.formatCalendarDay(startOfView), "2026-11-11")

        let queryRange = CalendarWindowMath.dayEventQueryRange(date: startOfView)
        let rangeStart = try XCTUnwrap(
            CompassDateParsing.parseInEffectiveTimeZone(queryRange.startDate))
        let rangeEnd = try XCTUnwrap(
            CompassDateParsing.parseInEffectiveTimeZone(queryRange.endDate))

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
                timeZone: IANATimeZone(rawValue: "America/Denver")
            )
        }
        let work = denverCalendars[0]
        let personal = denverCalendars[1]
        let morningStart = try XCTUnwrap(
            CompassDateParsing.parseGridDateTime(
                "2026-11-11T09:00:00.000",
                timeZoneIdentifier: "America/Denver"
            )
        )
        let morningEnd = try XCTUnwrap(
            CompassDateParsing.parseGridDateTime(
                "2026-11-11T10:30:00.000",
                timeZoneIdentifier: "America/Denver"
            )
        )
        XCTAssertTrue(morningStart < rangeEnd && morningEnd > rangeStart)

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
            visibleDateKeys: ["2026-11-11"]
        )

        XCTAssertEqual(scenario.dayViewCalendarsForLayout().map(\.name), ["Work", "Personal"])
    }
}
