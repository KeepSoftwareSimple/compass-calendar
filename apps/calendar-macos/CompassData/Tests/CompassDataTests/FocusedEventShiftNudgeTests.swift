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
        XCTAssertEqual(model.focusStore.edge, .startDate)
        await assertFinishedNudgePersistence(model)

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
        await assertFinishedNudgePersistence(model)

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
        await assertFinishedNudgePersistence(model)

        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        guard case .allDay(let schedule) = stored.schedule else {
            return XCTFail("Expected all-day schedule")
        }
        XCTAssertEqual(schedule.start, "2026-01-01")
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
        await assertFinishedNudgePersistence(model)

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
        await assertFinishedNudgePersistence(model)
        await model.undoLastChangeAndWait()
        await assertFinishedNudgePersistence(model)

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
        XCTAssertNotEqual(model.statusToastStore.message, "Event changed since your last edit")
        await assertFinishedNudgePersistence(model)

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
        await assertFinishedNudgePersistence(model)
        let stored = try XCTUnwrap(persistedEvent(environment, id: original.id))
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    func testUndoAfterFirstRemoteReplaceBlockedSettlesToOriginalSchedule() async throws {
        let hold = FirstRemoteReplaceHold()
        hold.arm()
        let (model, environment, original, capture) = try await makeSignedInRemoteTimedEvent(replaceHold: hold)
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        let firstPutObserved = await hold.waitUntilFirstPutObserved()
        XCTAssertTrue(firstPutObserved)
        async let undo: Void = model.undoLastChangeAndWait()
        try await Task.sleep(for: .milliseconds(100))
        hold.releaseFirst()
        await undo
        XCTAssertNotEqual(model.statusToastStore.message, "Event changed since your last edit")
        await assertFinishedNudgePersistence(model)
        XCTAssertGreaterThanOrEqual(hold.observedPutCount(), 2)
        await model.refreshVisibleRange()
        let stored = try XCTUnwrap(EventRepository(database: environment.database).fetch(id: original.id))
        XCTAssertEqual(stored.schedule, original.schedule)
        if case .timed(let timed) = capture.lastInput?.schedule {
            XCTAssertTrue(timed.start.rawValue.hasPrefix("2026-01-01T10:00:00"))
        } else {
            XCTFail("Expected undo replace payload with original start")
        }
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
        await assertFinishedNudgePersistence(model)
        let input = try XCTUnwrap(captured.lastInput)
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
        await assertFinishedNudgePersistence(model)
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

    func testWeekViewRejectsAllDaySavedEventStartEdgeNudgeOffWeek() async throws {
        let (model, environment, _) = try await makeWritableAllDayEvent()
        let weekStart = try XCTUnwrap(CompassDateParsing.parseInEffectiveTimeZone("2025-12-28"))
        let event = try eventOnAllDay(weekStart)
        try environment.localEventRepository.put(.init(id: event.id, event: event, isDemo: false))
        model.loadedEvents = [event]
        model.viewStore.view = .week
        model.viewStore.setAnchorDate(weekStart)
        model.rebuildPresentation()
        model.focusEvent(eventId: event.id.rawValue)
        model.focusStore.setEdge(
            eventId: event.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: true
        )
        XCTAssertFalse(model.nudgeDraftOrPlace(key: "ArrowLeft", shiftKey: true, altKey: false))
        await assertFinishedNudgePersistence(model)
        let stored = try XCTUnwrap(persistedEvent(environment, id: event.id))
        XCTAssertEqual(stored.schedule, event.schedule)
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

    private func assertFinishedNudgePersistence(
        _ model: NativeCalendarRootModel,
        file: StaticString = #file,
        line: UInt = #line
    ) async {
        let finished = await model.waitForPendingFocusedEventNudgeForTests()
        XCTAssertTrue(finished, file: file, line: line)
    }

    private func persistedEvent(_ environment: NativeCalendarEnvironment, id: EventId) throws -> Event? {
        try environment.localEventRepository.fetchAll().first { $0.id == id }?.event
    }

    private func eventOnAllDay(_ day: Date) throws -> Event {
        let startKey = CompassDateParsing.formatCalendarDay(day)
        let calendar = EffectiveTimeZone.calendar
        let exclusiveEnd = try XCTUnwrap(calendar.date(byAdding: .day, value: 1, to: day))
        let endKey = CompassDateParsing.formatCalendarDay(exclusiveEnd)
        let json = """
        {
          "id": "week-clamp-allday",
          "calendarId": "cal-1",
          "content": { "kind": "details", "title": "Week edge", "description": "" },
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-01T00:00:00.000Z",
          "recurrence": { "kind": "single" },
          "schedule": { "kind": "allDay", "start": "\(startKey)", "end": "\(endKey)" }
        }
        """
        return try ContractTestDecoding.decodeJSON(json, as: Event.self)
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
        model.loadedEvents = [event]
        model.updateContentTrackWidth(1200)
        model.focusEvent(eventId: event.id.rawValue)
        return (model, environment, event)
    }

    private func makeSignedInRemoteTimedEvent(
        replaceHold: FirstRemoteReplaceHold? = nil
    ) async throws
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
                if let replaceHold {
                    replaceHold.gateFirstPutIfNeeded()
                }
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

private final class FirstRemoteReplaceHold: @unchecked Sendable {
    private let lock = NSLock()
    private var armed = false
    private var holdingFirst = false
    private var firstPutObserved = false
    private var putCount = 0

    func arm() { lock.withLock { armed = true } }

    func gateFirstPutIfNeeded() {
        let shouldSpin: Bool = lock.withLock {
            putCount += 1
            if armed, putCount == 1 {
                holdingFirst = true
                firstPutObserved = true
                return true
            }
            return false
        }
        if shouldSpin {
            while lock.withLock({ holdingFirst }) {
                Thread.sleep(forTimeInterval: 0.005)
            }
        }
    }

    func waitUntilFirstPutObserved(timeout: Duration = .seconds(3)) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while ContinuousClock.now < deadline {
            if lock.withLock({ firstPutObserved }) { return true }
            try? await Task.sleep(for: .milliseconds(25))
        }
        return false
    }

    func releaseFirst() { lock.withLock { holdingFirst = false } }

    func observedPutCount() -> Int { lock.withLock { putCount } }
}

private final class ReplaceInputCapture: @unchecked Sendable {
    private let lock = NSLock()
    private var inputs: [ReplaceEventInput] = []
    var lastInput: ReplaceEventInput? { lock.withLock { inputs.last } }
    func store(_ value: ReplaceEventInput) { lock.withLock { inputs.append(value) } }
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
