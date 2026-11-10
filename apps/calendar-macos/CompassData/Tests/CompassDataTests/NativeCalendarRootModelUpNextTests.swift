import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class NativeCalendarRootModelUpNextTests: XCTestCase {
    func testOpenUpNextShowsEventDetails() async throws {
        let model = try await demoModel()
        let id = try XCTUnwrap(model.upNextState.snapshot.upNext?.id)

        model.openUpNextEvent()

        XCTAssertTrue(model.isEventFormVisible)
        XCTAssertEqual(model.draftStore.gridDraft?.sourceEventId?.rawValue, id)
        XCTAssertEqual(model.focusStore.focusedEventId?.rawValue, id)
    }

    func testOpenUpNextUsesSidebandEventOutsideLoadedGridAndLeavesLifeView() async throws {
        let model = try await demoModel()
        let id = try XCTUnwrap(model.upNextState.snapshot.upNext?.id)
        let event = try XCTUnwrap(model.sidebandEvents.first { $0.id.rawValue == id })
        model.loadedEvents = []
        model.sidebandEvents = [event]
        model.viewStore.view = .life

        model.openUpNextEvent()

        XCTAssertEqual(model.viewStore.view, .week)
        XCTAssertTrue(model.isEventFormVisible)
        XCTAssertEqual(model.draftStore.gridDraft?.sourceEventId, event.id)
        XCTAssertEqual(model.baselineEvent(for: try XCTUnwrap(model.draftStore.gridDraft)), event)
    }

    func testOpenUpNextPreservesAnExistingDraft() async throws {
        let model = try await demoModel()
        model.handleShortcut(.createTimed)
        model.updateDraftFromForm(title: "Unfinished event")
        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        let anchor = model.viewStore.anchorDate

        model.openUpNextEvent()

        XCTAssertEqual(model.draftStore.gridDraft, draft)
        XCTAssertEqual(model.viewStore.anchorDate, anchor)
    }

    func testEventDeepLinkFocusesItsEventFromLifeView() async throws {
        let model = try await demoModel()
        let id = try XCTUnwrap(model.upNextState.snapshot.upNext?.id)
        let event = try XCTUnwrap(model.sidebandEvents.first { $0.id.rawValue == id })
        model.loadedEvents = []
        model.sidebandEvents = [event]
        model.viewStore.view = .life

        model.handleDeepLink("compass://event/\(id)")

        XCTAssertEqual(model.viewStore.view, .week)
        XCTAssertEqual(model.focusStore.focusedEventId?.rawValue, id)
        XCTAssertTrue(model.loadedEvents.contains { $0.id == event.id })
        XCTAssertFalse(model.isEventFormVisible)
    }

    func testAllDayEventDeepLinkNavigatesAndFocuses() async throws {
        let model = try await demoModel()
        let event = try XCTUnwrap(model.loadedEvents.first {
            if case .allDay = $0.schedule { return true }
            return false
        })

        model.handleDeepLink("compass://event/\(event.id.rawValue)")

        XCTAssertEqual(model.focusStore.focusedEventId, event.id)
        XCTAssertEqual(model.focusStore.focusedEventType, .allDay)
        XCTAssertTrue(EffectiveTimeZone.calendar.isDate(
            model.viewStore.anchorDate, inSameDayAs: model.eventStart(event)))
    }

    private func demoModel() async throws -> NativeCalendarRootModel {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try .load())
        await model.start()
        return model
    }

    /// Regression: anonymous local-mode users saw "All clear" because the
    /// sideband only loaded for signed-in sessions.
    func testLocalModeUpNextShowsTheNextLocalEvent() async throws {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        XCTAssertEqual(environment.eventsStore.source, .local)
        let model = NativeCalendarRootModel(environment: environment)
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = EffectiveTimeZone.timeZone
        let start = Date().addingTimeInterval(10 * 60)
        let json = """
        {
          "id": "local-up-next",
          "calendarId": "507f1f77bcf86cd799439011",
          "content": { "kind": "details", "title": "Coffee", "description": "" },
          "createdAt": "2026-06-10T15:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "timed",
            "start": "\(formatter.string(from: start))",
            "end": "\(formatter.string(from: start.addingTimeInterval(30 * 60)))",
            "timeZone": "\(EffectiveTimeZone.identifier)"
          }
        }
        """
        let event = try JSONDecoder().decode(Event.self, from: Data(json.utf8))
        try environment.localEventRepository.putMany([
            LocalEventRecord(id: event.id, event: event, isDemo: false),
        ])

        await model.refreshSideband()

        XCTAssertEqual(model.upNextState.snapshot.upNext?.title, "Coffee")
    }

    /// Regression: a just-created event stayed out of Up next ("All clear")
    /// until the 60 s sideband timer, because saves only reloaded the grid.
    func testReloadingLoadedEventsUpdatesUpNextImmediately() async throws {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment)
        await model.refreshSideband()
        XCTAssertNil(model.upNextState.snapshot.upNext)

        model.loadedEvents = [try Self.timedEvent(title: "Just created", startingIn: 10 * 60)]

        XCTAssertEqual(model.upNextState.snapshot.upNext?.title, "Just created")
    }

    /// Regression: after undo, redo, undo of a create, Up next and the menu bar
    /// agenda still showed the event ("Untitled event in 2m").
    func testUndoRedoUndoOfACreateClearsUpNext() async throws {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        // Start with a local calendar but no sample events competing for Up next.
        try environment.userMetadataRepository.upsert(key: DemoDataSeeder.migrationKey, value: true)
        let model = NativeCalendarRootModel(environment: environment)
        await model.start()
        let calendarId = try XCTUnwrap(model.calendars.first?.id)
        let event = try Self.timedEvent(title: "Just created", startingIn: 2 * 60, calendarId: calendarId)
        let upNextTitle = { model.upNextState.snapshot.upNext?.title }
        try environment.localEventRepository.putMany([
            LocalEventRecord(id: event.id, event: event, isDemo: false),
        ])
        model.loadedEvents = try environment.eventsStore.fetchAllEvents()
        model.recordCreateUndo(for: event)
        XCTAssertEqual(upNextTitle(), "Just created")

        await model.undoLastChangeAndWait()
        XCTAssertNotEqual(upNextTitle(), "Just created")

        model.redoLastChange()
        for _ in 0 ..< 40 where upNextTitle() != "Just created" {
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(upNextTitle(), "Just created")

        await model.undoLastChangeAndWait()
        XCTAssertNotEqual(upNextTitle(), "Just created")
    }

    private static func timedEvent(
        title: String,
        startingIn interval: TimeInterval,
        calendarId: String = "507f1f77bcf86cd799439011"
    ) throws -> Event {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = EffectiveTimeZone.timeZone
        let start = Date().addingTimeInterval(interval)
        let json = """
        {
          "id": "just-created",
          "calendarId": "\(calendarId)",
          "content": { "kind": "details", "title": "\(title)", "description": "" },
          "createdAt": "2026-06-10T15:00:00.000Z",
          "updatedAt": null,
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "timed",
            "start": "\(formatter.string(from: start))",
            "end": "\(formatter.string(from: start.addingTimeInterval(30 * 60)))",
            "timeZone": "\(EffectiveTimeZone.identifier)"
          }
        }
        """
        return try JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }
}
