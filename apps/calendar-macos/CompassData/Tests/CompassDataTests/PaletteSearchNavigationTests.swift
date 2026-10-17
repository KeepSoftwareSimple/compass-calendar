import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class PaletteSearchNavigationTests: XCTestCase {
    func testRemoteTimedResultNavigatesOutsideLoadedWeek() async throws {
        let model = try await makeModel()
        let event = try remoteEvent(model: model, schedule: .timed(.init(end: "2026-08-10T10:00:00.000Z",
            kind: "timed", start: "2026-08-10T09:00:00.000Z", timeZone: "UTC")))
        model.toggleCommandPalette()
        model.commandPaletteStore.query = "remote"
        model.acceptPaletteSearchResults([event], query: "remote")
        XCTAssertEqual(model.paletteEventSearchHits.map(\.eventId), [event.id.rawValue])
        model.focusPaletteEvent(eventId: event.id.rawValue)
        XCTAssertTrue(EffectiveTimeZone.calendar.isDate(model.viewStore.anchorDate,
            inSameDayAs: try XCTUnwrap(CompassDateParsing.parseInEffectiveTimeZone("2026-08-10T09:00:00.000Z"))))
        XCTAssertEqual(model.focusStore.focusedEventId, event.id)
    }

    func testRemoteAllDayResultLeavesLifeViewAndFocusesItsDay() async throws {
        let model = try await makeModel()
        model.viewStore.view = .life
        let event = try remoteEvent(model: model,
            schedule: .allDay(.init(end: "2026-08-12", kind: "allDay", start: "2026-08-10")))
        model.toggleCommandPalette()
        model.commandPaletteStore.query = "remote"
        model.acceptPaletteSearchResults([event], query: "remote")
        model.focusPaletteEvent(eventId: event.id.rawValue)
        XCTAssertEqual(model.viewStore.view, .week)
        XCTAssertEqual(CompassDateParsing.formatCalendarDay(model.viewStore.anchorDate), "2026-08-10")
        XCTAssertEqual(model.focusStore.focusedEventId, event.id)
    }

    func testFreshSearchSnapshotReplacesAnAlreadyLoadedVersion() async throws {
        let model = try await makeModel()
        let old = try remoteEvent(model: model,
            schedule: .allDay(.init(end: "2026-06-12", kind: "allDay", start: "2026-06-11")))
        let fresh = try remoteEvent(model: model,
            schedule: .allDay(.init(end: "2026-08-11", kind: "allDay", start: "2026-08-10")))
        model.loadedEvents.append(old)
        model.toggleCommandPalette()
        model.commandPaletteStore.query = "remote"
        model.acceptPaletteSearchResults([fresh], query: "remote")
        model.focusPaletteEvent(eventId: fresh.id.rawValue)
        XCTAssertEqual(model.loadedEvents.filter { $0.id == fresh.id }, [fresh])
        XCTAssertEqual(CompassDateParsing.formatCalendarDay(model.viewStore.anchorDate), "2026-08-10")
    }

    func testResultsForAnotherOrClosedQueryAreRejectedAndReopeningClearsSnapshots() async throws {
        let model = try await makeModel()
        let event = try remoteEvent(model: model,
            schedule: .allDay(.init(end: "2026-08-11", kind: "allDay", start: "2026-08-10")))
        model.toggleCommandPalette()
        model.commandPaletteStore.query = "different"
        model.acceptPaletteSearchResults([event], query: "remote")
        XCTAssertTrue(model.paletteEventSearchHits.isEmpty)
        model.commandPaletteStore.close()
        model.acceptPaletteSearchResults([event], query: "remote")
        XCTAssertTrue(model.paletteEventSearchHits.isEmpty)
        model.toggleCommandPalette()
        model.commandPaletteStore.query = "remote"
        model.acceptPaletteSearchResults([event], query: "remote")
        XCTAssertFalse(model.paletteEventSearchEvents.isEmpty)
        model.toggleCommandPalette()
        model.toggleCommandPalette()
        XCTAssertTrue(model.paletteEventSearchEvents.isEmpty)
        XCTAssertTrue(model.paletteEventSearchHits.isEmpty)
    }

    func testShortQueryCancelsThePendingSearchAndClearsSnapshots() async throws {
        let model = try await makeModel()
        let event = try remoteEvent(model: model,
            schedule: .allDay(.init(end: "2026-08-11", kind: "allDay", start: "2026-08-10")))
        model.toggleCommandPalette()
        model.commandPaletteStore.query = "remote"
        model.acceptPaletteSearchResults([event], query: "remote")
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        let task = Task { for await _ in stream {} }
        model.paletteSearchTask = task
        model.commandPaletteStore.query = "r"
        model.schedulePaletteEventSearch()
        XCTAssertTrue(task.isCancelled)
        XCTAssertNil(model.paletteSearchTask)
        XCTAssertTrue(model.paletteEventSearchEvents.isEmpty)
        XCTAssertTrue(model.paletteEventSearchHits.isEmpty)
        continuation.finish()
        await task.value
    }

    func testEndingTheSessionClearsSearchSnapshots() async throws {
        let model = try await makeModel()
        let event = try remoteEvent(model: model,
            schedule: .allDay(.init(end: "2026-08-11", kind: "allDay", start: "2026-08-10")))
        model.toggleCommandPalette()
        model.commandPaletteStore.query = "remote"
        model.acceptPaletteSearchResults([event], query: "remote")
        XCTAssertFalse(model.paletteEventSearchEvents.isEmpty)
        await model.authStore.handleSessionExpired()
        XCTAssertTrue(model.paletteEventSearchEvents.isEmpty)
        XCTAssertTrue(model.paletteEventSearchHits.isEmpty)
        XCTAssertFalse(model.commandPaletteStore.isOpen)
    }

    private func makeModel() async throws -> NativeCalendarRootModel {
        let previous = EffectiveTimeZone.identifier
        let environment = try NativeCalendarEnvironment(appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true, sessionStore: MemorySessionStore(tokens: nil))
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        addTeardownBlock { EffectiveTimeZone.identifier = previous }
        await model.start()
        return model
    }

    private func remoteEvent(model: NativeCalendarRootModel, schedule: EventSchedule) throws -> Event {
        let sample = try XCTUnwrap(model.loadedEvents.first)
        return Event(calendarId: sample.calendarId,
            content: .details(.init(description: "", kind: "details", title: "Remote planning")),
            createdAt: sample.createdAt, id: "remote-only", recurrence: .single(.init(kind: "single")),
            schedule: schedule, updatedAt: sample.updatedAt)
    }
}
