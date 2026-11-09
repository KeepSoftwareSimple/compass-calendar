import CompassKit
import XCTest
@testable import CompassData

/// Tyler's Devotion report: Google `colorId` 4 stores as Compass `coral` (salmon `#E67C73`), not
/// `colorHex` on the wire (`googleColorIdToSlot` / `EventColorSlotHex.hex(.coral)`).
@MainActor
final class NativeCalendarRootModelPendingRecurringColorTests: XCTestCase {
    func testKeyboardNudgeKeepsCoralFillOnDraftOverlayBeforeSave() async throws {
        EffectiveTimeZone.identifier = "UTC"
        let devotion = try googleSyncedCoralOccurrence()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        try environment.localEventRepository.putMany([
            LocalEventRecord(id: devotion.id, event: devotion, isDemo: false),
        ])
        try environment.calendarRepository.upsert(calendars: [
            LocalCalendarSentinel.synthesizeCalendar(id: devotion.calendarId),
        ])
        let model = NativeCalendarRootModel(environment: environment)
        await model.start()
        model.loadedEvents = [devotion]
        model.viewStore.setAnchorDate(CalendarWindowMath.sundayWeekViewStart(
            containing: CompassDateParsing.parseInEffectiveTimeZone("2026-07-06T12:00:00.000Z")!
        ))
        model.updateContentTrackWidth(1200)
        model.rebuildPresentation()
        model.focusEvent(eventId: devotion.id.rawValue)
        model.openKeyboardEditForFocusedEvent()
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: false, altKey: false))

        let hex = try XCTUnwrap(cardFillHex(eventId: devotion.id.rawValue, model: model))
        XCTAssertEqual(hex, EventColorSlotHex.hex(for: .coral))
    }

    func testOpenFormEditKeepsCoralFillOnDraftOverlayBeforeSave() async throws {
        EffectiveTimeZone.identifier = "UTC"
        let devotion = try googleSyncedCoralOccurrence()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        try environment.localEventRepository.putMany([
            LocalEventRecord(id: devotion.id, event: devotion, isDemo: false),
        ])
        try environment.calendarRepository.upsert(calendars: [
            LocalCalendarSentinel.synthesizeCalendar(id: devotion.calendarId),
        ])
        let model = NativeCalendarRootModel(environment: environment)
        await model.start()
        model.loadedEvents = [devotion]
        model.viewStore.setAnchorDate(CalendarWindowMath.sundayWeekViewStart(
            containing: CompassDateParsing.parseInEffectiveTimeZone("2026-07-06T12:00:00.000Z")!
        ))
        model.updateContentTrackWidth(1200)
        model.rebuildPresentation()

        model.focusEvent(eventId: devotion.id.rawValue)
        model.openKeyboardEditForFocusedEvent()
        model.openEventFormForCurrentDraft()
        let nudged = DraftSchedule(
            start: devotion.scheduleStart().addingTimeInterval(3600),
            end: devotion.scheduleEnd().addingTimeInterval(3600),
            kind: .timed
        )
        model.updateDraftFromForm(schedule: nudged)
        model.rebuildPresentation()

        let hex = try XCTUnwrap(cardFillHex(eventId: devotion.id.rawValue, model: model))
        XCTAssertEqual(hex, EventColorSlotHex.hex(for: .coral))
    }

    private func cardFillHex(eventId: String, model: NativeCalendarRootModel) -> String? {
        let widths = model.timeGridState.resolvedColumnWidths()
        return model.timeGridState.snapshot(colWidths: widths).cards
            .first { $0.eventId == eventId }?
            .fillColorHex
    }

    /// Google `colorId: "4"` → slot `coral` (hex is derived at render time, not stored on sync).
    private func googleSyncedCoralOccurrence() throws -> Event {
        let json = """
        {
          "id": "aaaaaaaaaaaaaaaaaaaaaaaa|2026-07-06T12:15:00.000Z",
          "calendarId": "507f1f77bcf86cd799439011",
          "content": {
            "kind": "details",
            "title": "Devotion",
            "description": "",
            "color": "coral"
          },
          "createdAt": "2026-06-01T00:00:00.000Z",
          "updatedAt": "2026-06-01T00:00:00.000Z",
          "recurrence": {
            "kind": "occurrence",
            "seriesId": "bbbbbbbbbbbbbbbbbbbbbbbb"
          },
          "schedule": {
            "kind": "timed",
            "start": "2026-07-06T12:15:00.000Z",
            "end": "2026-07-06T13:15:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: Event.self)
    }

}

private extension Event {
    func scheduleStart() -> Date {
        guard case .timed(let timed) = schedule else { return Date() }
        return CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue) ?? Date()
    }

    func scheduleEnd() -> Date {
        guard case .timed(let timed) = schedule else { return Date() }
        return CompassDateParsing.parseInEffectiveTimeZone(timed.end.rawValue) ?? Date()
    }
}
