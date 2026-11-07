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
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())

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
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())

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
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())

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
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())

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
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())
        await model.undoLastChangeAndWait()
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())

        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    func testUndoDuringPendingNudgeWriteEventuallyRestoresSchedule() async throws {
        let (model, environment, original) = try await makeWritableTimedEvent()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        await model.undoLastChangeAndWait()
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())

        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    func testShiftNudgeRejectedInLifeView() async throws {
        let (model, environment, original) = try await makeWritableTimedEvent()
        model.viewStore.view = .life
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertFalse(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())
        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    func testSignedInNudgeSendsScheduleOnRemoteReplace() async throws {
        let (model, _, original, captured) = try await makeSignedInRemoteTimedEvent()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())
        let input = try XCTUnwrap(captured.input)
        XCTAssertNotNil(input.schedule)
        if case .timed(let timed) = input.schedule {
            XCTAssertTrue(timed.start.rawValue.hasPrefix("2026-01-01T10:15:00"))
        } else {
            XCTFail("Expected timed schedule in replace payload")
        }
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
        XCTAssertTrue(await model.waitForPendingFocusedEventNudgeForTests())
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

    private func makeSignedInRemoteTimedEvent() async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment, Event, ReplaceInputCapture)
    {
        let capture = ReplaceInputCapture()
        let previous = EffectiveTimeZone.identifier
        let session = StubURLProtocol.makeSession()
        let front = Data(#"{"uid":"account-a"}"#.utf8).base64EncodedString()
        let environment = try NativeCalendarEnvironment(
            appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: .init(
                accessToken: "access",
                refreshToken: "refresh",
                frontToken: front
            )),
            urlSession: session
        )
        try AuthRememberedState.markUserHasAuthenticated(repository: environment.userMetadataRepository)
        try environment.userMetadataRepository.upsert(key: DemoDataSeeder.migrationKey, value: true)
        try AccountCacheIdentity.record(userId: "account-a", repository: environment.userMetadataRepository)
        let event = try StoreSampleEvents.timedEvent(id: "remote-shift-nudge")
        let calendar = CompassCalendar(
            access: .owner,
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
            description: "",
            foregroundColor: "#000000",
            id: event.calendarId.rawValue,
            isActive: true,
            isPrimary: true,
            isVisible: true,
            name: "Remote",
            provider: "google",
            timeZone: "UTC"
        )
        try environment.calendarRepository.upsert(calendars: [calendar])
        try EventRepository(database: environment.database).upsert(events: [event], isLocal: false)
        let model = NativeCalendarRootModel(environment: environment)
        model.viewStore.setPinnedTimeZone("UTC")
        model.viewStore.anchorDate = try XCTUnwrap(
            CompassDateParsing.parseInEffectiveTimeZone("2026-01-01T12:00:00.000Z")
        )
        let range = CalendarWindowMath.weekEventQueryRange(anchor: model.viewStore.anchorDate)
        try RangeCache(database: environment.database).markLoaded(
            key: .init(scope: .week, source: .remote, start: range.startDate, end: range.endDate),
            fetchedAt: Date(timeIntervalSince1970: 0)
        )
        StubURLProtocol.Handler.requestHandler = { request in
            if request.httpMethod == "PUT",
                request.url?.path == "/api/event/\(event.id.rawValue)"
            {
                let body = HTTPBodyCapture.data(from: request)
                if let input = try? JSONDecoder().decode(ReplaceEventInput.self, from: body) {
                    capture.store(input)
                }
                let response = EventResponse(event: try StoreSampleEvents.response(from: event))
                return .init(statusCode: 200, body: try JSONEncoder().encode(response))
            }
            throw URLError(.notConnectedToInternet)
        }
        addTeardownBlock {
            StubURLProtocol.Handler.requestHandler = nil
            session.invalidateAndCancel()
            EffectiveTimeZone.identifier = previous
        }
        await model.start()
        model.authStore.closeModal()
        model.focusEvent(eventId: event.id.rawValue)
        return (model, environment, event, capture)
    }
}

private final class ReplaceInputCapture: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var input: ReplaceEventInput?
    func store(_ value: ReplaceEventInput) { lock.withLock { input = value } }
}

private enum HTTPBodyCapture {
    static func data(from request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(contentsOf: buffer.prefix(count))
        }
        return data
    }
}
