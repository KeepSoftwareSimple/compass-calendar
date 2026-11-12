import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class NativeCalendarRootModelAllDayTests: XCTestCase {
    func testChangingStartRetainsEndUntilItWouldInvertRange() throws {
        let savedZone = EffectiveTimeZone.identifier
        defer { EffectiveTimeZone.identifier = savedZone }
        let model = try model(startDay: 7, endDay: 10)
        model.updateAllDayDraftStart(date(8))
        XCTAssertEqual(model.draftStore.gridDraft?.schedule.end, date(10))
        model.updateAllDayDraftStart(date(12))
        XCTAssertEqual(model.draftStore.gridDraft?.schedule.start, date(12))
        XCTAssertEqual(model.draftStore.gridDraft?.schedule.end, date(13))
    }

    func testLastIncludedDayStoresExclusiveEndAcrossDaylightSaving() throws {
        let savedZone = EffectiveTimeZone.identifier
        defer { EffectiveTimeZone.identifier = savedZone }
        let model = try model(startDay: 7, endDay: 8)
        model.updateAllDayDraftEnd(date(8))
        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        XCTAssertEqual(draft.schedule.end, date(9))
        XCTAssertEqual(draft.schedule.end.timeIntervalSince(draft.schedule.start), 47 * 3600)
        guard case .allDay(let schedule) = GridEventDraftMapping.createInput(from: draft)?.schedule else {
            return XCTFail("Expected all-day schedule")
        }
        XCTAssertEqual(schedule.start, "2026-03-07")
        XCTAssertEqual(schedule.end, "2026-03-09")
        model.updateAllDayDraftEnd(date(6))
        XCTAssertEqual(model.draftStore.gridDraft?.schedule.end, date(8))
    }

    private func date(_ day: Int) -> Date {
        EffectiveTimeZone.calendar.date(from: DateComponents(year: 2026, month: 3, day: day))!
    }

    private func denverPrimaryCalendar() -> CompassCalendar {
        CompassCalendar(
            access: .owner,
            accountEmail: "a@example.com",
            backgroundColor: "#ffffff",
            capabilities: .init(
                canInviteAttendees: false,
                canManage: false,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: false,
                canWrite: true,
                conferenceKinds: []
            ),
            conference: nil,
            createsGoogleMeet: false,
            description: "",
            foregroundColor: "#000000",
            id: "denver-primary",
            isActive: true,
            isPrimary: true,
            isVisible: true,
            name: "Primary",
            provider: "google",
            timeZone: IANATimeZone(rawValue: "America/Denver")
        )
    }

    private func model(startDay: Int, endDay: Int) throws -> NativeCalendarRootModel {
        CompassDeviceTimeZone.setIdentifierProviderForTests { "GMT" }
        let model = NativeCalendarRootModel(environment: try NativeCalendarEnvironment(inMemoryDatabase: true))
        model.applyCalendarsForPresentationTesting([denverPrimaryCalendar()])
        model.draftStore.startGridDraft(activity: .keyboardPlace, draft: GridEventDraft(
            clientId: .init(rawValue: "all-day"), schedule: .init(start: date(startDay), end: date(endDay), kind: .allDay),
            calendarId: .init(rawValue: "denver-primary")))
        return model
    }

    override func tearDown() async throws {
        CompassDeviceTimeZone.resetIdentifierProviderForTests()
        try await super.tearDown()
    }
}
