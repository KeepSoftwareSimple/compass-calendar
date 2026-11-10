import CompassData
import CompassKit
import XCTest

/// Regression: hex/slot fills must survive the gap between draft commit and API settle.
@MainActor
final class EventsStorePendingPresentationColorTests: XCTestCase {
    func testDraftOverlayResolvesSlotColorBeforeSave() throws {
        let event = try coralSlotOccurrence()
        var draft = try XCTUnwrap(GridEventDraftFromEvent.editDraft(from: event))
        draft.schedule = DraftSchedule(
            start: Date(timeIntervalSince1970: 1_800_000),
            end: Date(timeIntervalSince1970: 1_803_600),
            kind: .timed
        )
        let overlay = GridEventDraftMapping.overlay(
            from: draft,
            activity: .keyboardEdit,
            status: DraftStatus(activity: .keyboardEdit, isDrafting: true, isFormOpen: true)
        )
        XCTAssertEqual(overlay.colorHex, EventColorSlotHex.hex(for: .coral))
    }

    func testDraftOverlayKeepsProviderHexWhenSlotUnset() throws {
        let event = try hexOccurrence(colorHex: "#E67C73")
        var draft = try XCTUnwrap(GridEventDraftFromEvent.editDraft(from: event))
        draft.schedule = DraftSchedule(
            start: Date(timeIntervalSince1970: 1_800_000),
            end: Date(timeIntervalSince1970: 1_803_600),
            kind: .timed
        )
        let overlay = GridEventDraftMapping.overlay(
            from: draft,
            activity: .keyboardEdit,
            status: DraftStatus(activity: .keyboardEdit, isDrafting: true, isFormOpen: false),
            sourceColorHex: "#E67C73"
        )
        XCTAssertEqual(overlay.colorHex, "#E67C73")
    }

    func testReplaceInvokesCacheRefreshBeforeAPIReturns() async throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let mockAPI = MockEventsAPI()
        let store = EventsStore(
            repository: repository,
            localEvents: LocalEventRepository(database: database),
            rangeCache: RangeCache(database: database),
            eventsAPI: mockAPI
        )

        let seriesId = EventId(rawValue: "664e21f9a6b3f0b1c2d3e4f5")
        let occurrence = try hexOccurrence(
            id: "\(seriesId.rawValue)|2026-07-06T12:15:00.000Z",
            colorHex: "#E67C73"
        )
        try repository.upsert(events: [occurrence], isLocal: false)
        let edited = try movedOccurrence(from: occurrence)

        let input = try replaceInput(scope: .this)
        let apiGate = AsyncTestGate()
        mockAPI.replaceHandler = { _, _ in
            try await apiGate.waitForTest()
            return try StoreSampleEvents.response(from: edited)
        }

        var presentationEvents: [Event] = [occurrence]
        var refreshedBeforeSettle = false

        let replaceTask = Task {
            try await store.replaceOptimistic(
                id: occurrence.id,
                input: input,
                optimisticEvent: edited,
                onOptimisticCacheUpdated: { events in
                    presentationEvents = events
                    refreshedBeforeSettle = true
                }
            )
        }

        await Task.yield()
        await Task.yield()
        XCTAssertTrue(refreshedBeforeSettle)

        let renderedHex = CalendarEventViewModel.gridInputs(from: presentationEvents)
            .timedEvents
            .first { $0.eventId == occurrence.id.rawValue }?
            .colorHex
        XCTAssertEqual(renderedHex, "#E67C73")

        await apiGate.resume()
        _ = try await replaceTask.value
    }

    /// Stale `loadedEvents` keep the prior fill (`#E67C73`) but the old start time, not default gray.
    func testRepositoryRefreshUpdatesScheduleWhileColorHexSurvives() async throws {
        let database = try AppDatabase.inMemory()
        let repository = EventRepository(database: database)
        let mockAPI = MockEventsAPI()
        let store = EventsStore(
            repository: repository,
            localEvents: LocalEventRepository(database: database),
            rangeCache: RangeCache(database: database),
            eventsAPI: mockAPI
        )

        let occurrence = try hexOccurrence(colorHex: "#E67C73")
        try repository.upsert(events: [occurrence], isLocal: false)
        let edited = try movedOccurrence(from: occurrence)

        let input = try replaceInput(scope: .this)
        let apiGate = AsyncTestGate()
        mockAPI.replaceHandler = { _, _ in
            try await apiGate.waitForTest()
            return try StoreSampleEvents.response(from: edited)
        }

        var staleLoaded = [occurrence]
        let replaceTask = Task {
            try await store.replaceOptimistic(
                id: occurrence.id,
                input: input,
                optimisticEvent: edited
            )
        }

        await Task.yield()
        await Task.yield()

        let staleStart = CalendarEventViewModel.gridInputs(from: staleLoaded)
            .timedEvents.first?.startDate
        XCTAssertTrue(staleStart?.contains("12:15") == true)

        staleLoaded = try store.fetchAllEvents()
        let freshStart = CalendarEventViewModel.gridInputs(from: staleLoaded)
            .timedEvents.first?.startDate
        XCTAssertTrue(freshStart?.contains("13:15") == true)
        XCTAssertEqual(
            CalendarEventViewModel.gridInputs(from: staleLoaded).timedEvents.first?.colorHex,
            "#E67C73"
        )

        await apiGate.resume()
        _ = try await replaceTask.value
    }

    private func movedOccurrence(from occurrence: Event) throws -> Event {
        guard case .details(let payload) = occurrence.content else {
            throw XCTSkip("Expected details content")
        }
        return Event(
            calendarId: occurrence.calendarId,
            content: .details(payload),
            createdAt: occurrence.createdAt,
            id: occurrence.id,
            recurrence: occurrence.recurrence,
            schedule: .timed(
                EventSchedule_TimedPayload(
                    end: DateTime(rawValue: "2026-07-06T13:15:00.000Z"),
                    kind: "timed",
                    start: DateTime(rawValue: "2026-07-06T13:15:00.000Z"),
                    timeZone: IANATimeZone(rawValue: "UTC")
                )
            ),
            updatedAt: occurrence.updatedAt
        )
    }

    private func hexOccurrence(
        id: String = "aaaaaaaaaaaaaaaaaaaaaaaa",
        colorHex: String
    ) throws -> Event {
        let json = """
        {
          "id": "\(id)",
          "calendarId": "cal-1",
          "content": {
            "kind": "details",
            "title": "Devotion",
            "description": "",
            "colorHex": "\(colorHex)"
          },
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": null,
          "recurrence": {
            "kind": "occurrence",
            "seriesId": "664e21f9a6b3f0b1c2d3e4f5"
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

    private func coralSlotOccurrence() throws -> Event {
        let json = """
        {
          "id": "aaaaaaaaaaaaaaaaaaaaaaaa",
          "calendarId": "cal-1",
          "content": {
            "kind": "details",
            "title": "Devotion",
            "description": "",
            "color": "coral"
          },
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "occurrence", "seriesId": "664e21f9a6b3f0b1c2d3e4f5" },
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

    private func replaceInput(scope: ScopeEnum) throws -> ReplaceEventInput {
        let json = """
        {
          "content": {
            "kind": "details",
            "title": "Devotion",
            "description": "",
            "location": "",
            "color": null
          },
          "recurrence": { "kind": "preserve" },
          "schedule": {
            "kind": "timed",
            "start": "2026-07-06T13:15:00.000Z",
            "end": "2026-07-06T14:15:00.000Z",
            "timeZone": "UTC"
          },
          "scope": "\(scope.rawValue)"
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: ReplaceEventInput.self)
    }
}
