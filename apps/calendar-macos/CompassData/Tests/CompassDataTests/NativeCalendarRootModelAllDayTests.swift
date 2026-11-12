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

    private func model(startDay: Int, endDay: Int) throws -> NativeCalendarRootModel {
        let model = NativeCalendarRootModel(environment: try NativeCalendarEnvironment(inMemoryDatabase: true))
        model.viewStore.setCalendarTimeZoneHint("America/Denver")
        model.draftStore.startGridDraft(activity: .keyboardPlace, draft: GridEventDraft(
            clientId: .init(rawValue: "all-day"), schedule: .init(start: date(startDay), end: date(endDay), kind: .allDay),
            calendarId: .init(rawValue: "cal-1")))
        return model
    }
}
