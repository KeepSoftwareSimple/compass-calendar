import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class FocusedEventShiftNudgeTests: XCTestCase {
    func testFocusedSavedEventStartEdgeNudgePersistsToRepository() async throws {
        let (model, environment, original) = try await makeWritableTimedEvent()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        await model.waitForPendingFocusedEventNudgeForTests()

        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        if case .timed(let timed) = stored.schedule {
            XCTAssertTrue(timed.start.rawValue.hasPrefix("2026-01-01T10:15:00"))
            XCTAssertTrue(timed.end.rawValue.hasPrefix("2026-01-01T11:00:00"))
        } else {
            XCTFail("Expected timed schedule")
        }
    }

    func testFocusedSavedEventEndEdgeNudgePersistsToRepository() async throws {
        let (model, environment, original) = try await makeWritableTimedEvent()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .endDate,
            announcement: "Editing end time",
            isAllDay: false
        )
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowUp", shiftKey: true, altKey: false))
        await model.waitForPendingFocusedEventNudgeForTests()

        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        if case .timed(let timed) = stored.schedule {
            XCTAssertTrue(timed.start.rawValue.hasPrefix("2026-01-01T10:00:00"))
            XCTAssertTrue(timed.end.rawValue.hasPrefix("2026-01-01T10:45:00"))
        } else {
            XCTFail("Expected timed schedule")
        }
    }

    func testFocusedAllDayStartEdgeNudgePersistsToRepository() async throws {
        let (model, environment, original) = try await makeWritableAllDayEvent()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: true
        )
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowRight", shiftKey: true, altKey: false))
        await model.waitForPendingFocusedEventNudgeForTests()

        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        guard case .allDay(let schedule) = stored.schedule else {
            return XCTFail("Expected all-day schedule")
        }
        XCTAssertEqual(schedule.start, "2026-01-02")
        XCTAssertEqual(schedule.end, "2026-01-03")
    }

    func testTwoRapidNudgesPersistFinalSchedule() async throws {
        let (model, environment, original) = try await makeWritableTimedEvent()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        await model.waitForPendingFocusedEventNudgeForTests()

        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        if case .timed(let timed) = stored.schedule {
            XCTAssertTrue(timed.start.rawValue.hasPrefix("2026-01-01T10:30:00"))
            XCTAssertTrue(timed.end.rawValue.hasPrefix("2026-01-01T11:00:00"))
        } else {
            XCTFail("Expected timed schedule")
        }
    }

    func testNudgeThenUndoRestoresPersistedSchedule() async throws {
        let (model, environment, original) = try await makeWritableTimedEvent()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        await model.waitForPendingFocusedEventNudgeForTests()
        await model.undoLastChangeAndWait()
        await model.waitForPendingFocusedEventNudgeForTests()

        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    func testReadOnlyFocusedEventRejectsShiftNudge() async throws {
        let (model, environment, original) = try await makeWritableTimedEvent(canWrite: false)
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertFalse(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        await model.waitForPendingFocusedEventNudgeForTests()
        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    func testDraftStartEdgeNudgeUsesFocusedEdge() async throws {
        let (model, _, event) = try await makeWritableTimedEvent(canWrite: true)
        model.openKeyboardEditForFocusedEvent()
        model.focusStore.setEdge(
            eventId: event.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        let endBefore = model.draftStore.gridDraft?.schedule.end
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        XCTAssertEqual(draft.schedule.end, endBefore)
    }

    func testDraftEndEdgeNudgeOnAllDayDraft() async throws {
        let (model, _, event) = try await makeWritableAllDayEvent()
        model.openKeyboardEditForFocusedEvent()
        model.focusStore.setEdge(
            eventId: event.id,
            edge: .endDate,
            announcement: "Editing end time",
            isAllDay: true
        )
        let startBefore = model.draftStore.gridDraft?.schedule.start
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowRight", shiftKey: true, altKey: false))
        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        XCTAssertEqual(draft.schedule.start, startBefore)
    }

    private func persistedEvent(_ environment: NativeCalendarEnvironment, id: EventId) throws -> Event? {
        try environment.localEventRepository.fetchAll().first { $0.id == id }?.event
    }

    private func makeWritableTimedEvent(canWrite: Bool = true) async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment, Event)
    {
        try await makeWritableEvent(canWrite: canWrite, timed: true)
    }

    private func makeWritableAllDayEvent(canWrite: Bool = true) async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment, Event)
    {
        try await makeWritableEvent(canWrite: canWrite, timed: false)
    }

    private func makeWritableEvent(canWrite: Bool, timed: Bool) async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment, Event)
    {
        let previous = EffectiveTimeZone.identifier
        let environment = try NativeCalendarEnvironment(
            appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: nil)
        )
        try environment.userMetadataRepository.upsert(key: DemoDataSeeder.migrationKey, value: true)
        let sample = try timed
            ? StoreSampleEvents.timedEvent(id: "shift-nudge-event")
            : StoreSampleEvents.allDayEvent(id: "shift-nudge-allday")
        let event = Event(
            calendarId: sample.calendarId,
            content: sample.content,
            createdAt: sample.createdAt,
            id: sample.id,
            recurrence: sample.recurrence,
            schedule: sample.schedule,
            updatedAt: sample.updatedAt
        )
        let calendar = CompassCalendar(
            access: canWrite ? .owner : .reader,
            backgroundColor: "#ffffff",
            capabilities: .init(
                canInviteAttendees: false,
                canManage: false,
                canReadAvailability: true,
                canReadDetails: true,
                canWatchEvents: false,
                canWrite: canWrite,
                conferenceKinds: []
            ),
            description: "",
            foregroundColor: "#000000",
            id: event.calendarId.rawValue,
            isActive: true,
            isPrimary: false,
            isVisible: true,
            name: "Shared calendar",
            provider: "local",
            timeZone: "UTC"
        )
        try environment.calendarRepository.upsert(calendars: [calendar])
        try environment.localEventRepository.put(.init(id: event.id, event: event, isDemo: false))
        let model = NativeCalendarRootModel(environment: environment)
        model.viewStore.setPinnedTimeZone("UTC")
        model.viewStore.anchorDate = try XCTUnwrap(
            CompassDateParsing.parseInEffectiveTimeZone("2026-01-01T12:00:00.000Z")
        )
        addTeardownBlock { EffectiveTimeZone.identifier = previous }
        await model.start()
        model.authStore.closeModal()
        await model.bootstrapLocalEventsForTests()
        model.focusEvent(eventId: event.id.rawValue)
        return (model, environment, event)
    }
}
