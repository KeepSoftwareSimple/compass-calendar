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

    func testSaveCommitKeepsCoralFillWhileReplaceIsInFlight() async throws {
        EffectiveTimeZone.identifier = "UTC"
        let devotion = try googleSyncedCoralOccurrence()
        let apiGate = AsyncTestGate()
        let mockAPI = MockEventsAPI()
        let environment = try NativeCalendarEnvironment(
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: nil),
            eventsAPI: mockAPI,
            repositorySource: .remote
        )
        try AuthRememberedState.markUserHasAuthenticated(repository: environment.userMetadataRepository)
        try EventRepository(database: environment.database).upsert(events: [devotion], isLocal: false)
        try environment.calendarRepository.upsert(calendars: [
            LocalCalendarSentinel.synthesizeCalendar(id: devotion.calendarId),
        ])

        let edited = try movedDevotion(from: devotion)
        mockAPI.replaceHandler = { _, _ in
            await apiGate.wait()
            return try StoreSampleEvents.response(from: edited)
        }

        let model = NativeCalendarRootModel(environment: environment)
        await model.authStore.bootstrap(forceDemoSignedIn: true)
        await model.start()
        model.loadedEvents = try environment.eventsStore.fetchAllEvents()
        model.viewStore.setAnchorDate(CalendarWindowMath.sundayWeekViewStart(
            containing: CompassDateParsing.parseInEffectiveTimeZone("2026-07-06T12:00:00.000Z")!
        ))
        model.updateContentTrackWidth(1200)
        model.rebuildPresentation()

        model.focusEvent(eventId: devotion.id.rawValue)
        model.openKeyboardEditForFocusedEvent()
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: false, altKey: false))

        let saveTask = Task {
            await model.requestSaveDraft()
            if model.pendingRecurrenceScopePrompt == .save {
                await model.confirmRecurrenceScope(.this)
            }
        }
        for _ in 0 ..< 80 {
            if model.eventsStore.inFlightMutations > 0 { break }
            await Task.yield()
        }
        XCTAssertGreaterThan(model.eventsStore.inFlightMutations, 0)

        let hex = try XCTUnwrap(cardFillHex(eventId: devotion.id.rawValue, model: model))
        XCTAssertEqual(hex, EventColorSlotHex.hex(for: .coral))

        let saved = try XCTUnwrap(model.loadedEvents.first { $0.id == devotion.id })
        guard case .timed(let timed) = saved.schedule else {
            return XCTFail("Expected timed schedule on loadedEvents")
        }
        XCTAssertEqual(timed.start.rawValue, "2026-07-06T13:15:00.000Z")

        await apiGate.resume()
        _ = await saveTask.value
    }

    private func cardFillHex(eventId: String, model: NativeCalendarRootModel) -> String? {
        let widths = model.timeGridState.resolvedColumnWidths()
        return model.timeGridState.snapshot(colWidths: widths).cards
            .first { $0.eventId == eventId }?
            .fillColorHex
    }

    private func modelWithEvents(_ events: [Event]) async throws -> NativeCalendarRootModel {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let repository = EventRepository(database: environment.database)
        for event in events {
            try environment.localEventRepository.putMany([
                LocalEventRecord(id: event.id, event: event, isDemo: false),
            ])
        }
        try environment.calendarRepository.upsert(calendars: events.map {
            LocalCalendarSentinel.synthesizeCalendar(id: $0.calendarId)
        })
        let model = NativeCalendarRootModel(environment: environment)
        await model.start()
        model.loadedEvents = events
        model.viewStore.setAnchorDate(CalendarWindowMath.sundayWeekViewStart(
            containing: CompassDateParsing.parseInEffectiveTimeZone("2026-07-06T12:00:00.000Z")!
        ))
        model.updateContentTrackWidth(1200)
        model.rebuildPresentation()
        return model
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

    private func movedDevotion(from occurrence: Event) throws -> Event {
        guard case .details(let payload) = occurrence.content else {
            throw XCTSkip("Expected details")
        }
        return Event(
            calendarId: occurrence.calendarId,
            content: .details(payload),
            createdAt: occurrence.createdAt,
            id: occurrence.id,
            recurrence: occurrence.recurrence,
            schedule: .timed(
                EventSchedule_TimedPayload(
                    end: DateTime(rawValue: "2026-07-06T13:30:00.000Z"),
                    kind: "timed",
                    start: DateTime(rawValue: "2026-07-06T13:15:00.000Z"),
                    timeZone: IANATimeZone(rawValue: "UTC")
                )
            ),
            updatedAt: occurrence.updatedAt
        )
    }

}
