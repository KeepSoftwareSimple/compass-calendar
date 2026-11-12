import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelCalendarHintSyncTests: XCTestCase {
    func testCalendarHintChangeReanchorsWeekAndSchedulesRangeRefresh() async throws {
        let priorDefault = NSTimeZone.default
        defer { NSTimeZone.default = priorDefault }
        NSTimeZone.default = try XCTUnwrap(TimeZone(identifier: "UTC"))

        let referenceNow = try XCTUnwrap(
            CompassDateParsing.parseGridDateTime(
                "2026-11-12T00:23:00.000",
                timeZoneIdentifier: "UTC"
            )
        )
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, now: { referenceNow })
        model.viewStore.setCalendarTimeZoneHint("America/New_York")

        let nycOnly = [
            compassCalendar(id: "nyc", name: "NYC", timeZone: "America/New_York", isPrimary: true, isVisible: true),
        ]
        model.applyCalendarsForPresentationTesting(nycOnly)
        let anchorInNewYork = model.viewStore.anchorDate
        XCTAssertEqual(EffectiveTimeZone.identifier, "America/New_York")

        let hiddenDenverPrimary = [
            compassCalendar(
                id: "denver-primary", name: "Primary", timeZone: "America/Denver", isPrimary: true, isVisible: false
            ),
            compassCalendar(id: "nyc", name: "NYC", timeZone: "America/New_York", isPrimary: false, isVisible: true),
        ]
        model.applyCalendarsForPresentationTesting(hiddenDenverPrimary)

        XCTAssertEqual(EffectiveTimeZone.identifier, "America/Denver")
        XCTAssertNotEqual(model.viewStore.anchorDate, anchorInNewYork)
        let expected = CalendarWindowMath.sundayWeekViewStart(containing: referenceNow)
        XCTAssertEqual(model.viewStore.anchorDate, expected)
        XCTAssertTrue(model.testingVisibleRangeRefreshIsScheduled)
    }

    func testHiddenPrimaryDenverWinsOverVisibleNewYorkOnFullList() async throws {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment)
        model.applyCalendarsForPresentationTesting([
            compassCalendar(
                id: "denver-primary", name: "Primary", timeZone: "America/Denver", isPrimary: true, isVisible: false
            ),
            compassCalendar(id: "nyc", name: "NYC", timeZone: "America/New_York", isPrimary: false, isVisible: true),
        ])
        XCTAssertEqual(EffectiveTimeZone.identifier, "America/Denver")
    }

    private func compassCalendar(
        id: String,
        name: String,
        timeZone: String,
        isPrimary: Bool,
        isVisible: Bool
    ) -> CompassCalendar {
        let capabilities = CompassCalendarCapabilities(
            canInviteAttendees: false,
            canManage: false,
            canReadAvailability: true,
            canReadDetails: true,
            canWatchEvents: false,
            canWrite: true,
            conferenceKinds: []
        )
        return CompassCalendar(
            access: .owner,
            accountEmail: "a@example.com",
            backgroundColor: "#ffffff",
            capabilities: capabilities,
            conference: nil,
            createsGoogleMeet: false,
            description: "",
            foregroundColor: "#000000",
            id: id,
            isActive: true,
            isPrimary: isPrimary,
            isVisible: isVisible,
            name: name,
            provider: "google",
            timeZone: IANATimeZone(rawValue: timeZone)
        )
    }
}
