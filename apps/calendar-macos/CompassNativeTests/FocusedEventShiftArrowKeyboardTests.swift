import AppKit
import CompassData
import CompassKit
import XCTest

@MainActor
final class FocusedEventShiftArrowKeyboardTests: XCTestCase {
    func testRouterShiftArrowDownNudgesFocusedTimedStartEdge() async throws {
        _ = NSApplication.shared
        let (model, environment, original) = try await localTimedFixture()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )

        XCTAssertEqual(model.focusStore.focusedEventId, original.id)
        XCTAssertNotNil(model.focusedEvent(), "fixture must load event before router nudge")
        let router = try makeGridRouter(model: model)
        XCTAssertTrue(router.shiftArrow(.down), "router must handle shift+nudge for focused start edge")
        let updated = try XCTUnwrap(model.event(for: original.id))
        if case .timed(let timed) = updated.schedule {
            XCTAssertTrue(timed.start.rawValue.hasPrefix("2026-01-01T10:15:00"))
        } else {
            XCTFail("Expected timed schedule on model after nudge")
        }

        await assertFinishedNudgePersistence(model)
        let stored = try XCTUnwrap(
            environment.localEventRepository.fetchAll().first { $0.id == original.id }?.event
        )
        if case .timed(let timed) = stored.schedule {
            XCTAssertTrue(timed.start.rawValue.hasPrefix("2026-01-01T10:15:00"))
            XCTAssertTrue(timed.end.rawValue.hasPrefix("2026-01-01T11:00:00"))
        } else {
            XCTFail("Expected timed schedule in repository")
        }
    }

    func testRouterShiftArrowRightNudgesFocusedAllDayStartEdge() async throws {
        _ = NSApplication.shared
        let (model, environment, original) = try await localAllDayFixture()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: true
        )
        XCTAssertEqual(model.focusStore.focusedEventId, original.id)
        XCTAssertNotNil(model.focusedEvent(), "fixture must load event before router nudge")
        let router = try makeGridRouter(model: model)
        XCTAssertTrue(router.shiftArrow(.right))
        await assertFinishedNudgePersistence(model)

        let stored = try XCTUnwrap(
            environment.localEventRepository.fetchAll().first { $0.id == original.id }?.event
        )
        guard case .allDay(let schedule) = stored.schedule else {
            return XCTFail("Expected all-day schedule in repository")
        }
        XCTAssertEqual(schedule.start, "2026-01-01")
        XCTAssertEqual(schedule.end, "2026-01-03")
    }

    func testRouterShiftArrowUpNudgesFocusedTimedEndEdge() async throws {
        _ = NSApplication.shared
        let (model, _, original) = try await localTimedFixture()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .endDate,
            announcement: "Editing end time",
            isAllDay: false
        )
        XCTAssertEqual(model.focusStore.focusedEventId, original.id)
        XCTAssertNotNil(model.focusedEvent(), "fixture must load event before router nudge")
        let router = try makeGridRouter(model: model)
        XCTAssertTrue(router.shiftArrow(.up))
        await assertFinishedNudgePersistence(model)

        let stored = try XCTUnwrap(model.event(for: original.id))
        if case .timed(let timed) = stored.schedule {
            XCTAssertTrue(timed.end.rawValue.hasPrefix("2026-01-01T10:45:00"))
        } else {
            XCTFail("Expected timed schedule")
        }
    }

    func testRouterRejectsShiftArrowWhenReadOnly() async throws {
        _ = NSApplication.shared
        let (model, environment, original) = try await localTimedFixture(canWrite: false)
        XCTAssertNotNil(model.focusedEvent(), "fixture must load event before router nudge")
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        XCTAssertEqual(model.focusStore.focusedEventId, original.id)
        XCTAssertTrue(model.isReadOnly(event: original))
        let router = try makeGridRouter(model: model)
        XCTAssertFalse(router.shiftArrow(.down))
        await assertFinishedNudgePersistence(model)
        let stored = try XCTUnwrap(
            environment.localEventRepository.fetchAll().first { $0.id == original.id }?.event
        )
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    func testRouterIgnoresShiftArrowWhenEventFormIsOpen() async throws {
        _ = NSApplication.shared
        let (model, environment, original) = try await localTimedFixture()
        XCTAssertNotNil(model.focusedEvent(), "fixture must load focused event before opening form")
        model.openKeyboardEditForFocusedEvent()
        model.openEventFormForCurrentDraft()
        XCTAssertNotNil(model.draftStore.gridDraft, "keyboard edit must seed draft before form opens")
        XCTAssertTrue(model.isEventFormVisible)
        let router = try makeGridRouter(model: model)
        XCTAssertFalse(router.shiftArrow(.down))
        await assertFinishedNudgePersistence(model)
        let stored = try XCTUnwrap(
            environment.localEventRepository.fetchAll().first { $0.id == original.id }?.event
        )
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    func testRouterShiftArrowPlacesTimedDraftWhenNothingFocused() async throws {
        _ = NSApplication.shared
        let (model, _, _) = try await localTimedFixture()
        model.focusStore.resetEdgeFocus()
        XCTAssertNil(model.focusStore.focusedEventId)
        XCTAssertNil(model.draftStore.gridDraft)
        let router = try makeGridRouter(model: model)
        XCTAssertTrue(router.shiftArrow(.down))
        XCTAssertNotNil(model.draftStore.gridDraft)
        XCTAssertEqual(model.draftStore.status.activity, .keyboardPlace)
    }

    func testRouterIgnoresShiftArrowWhenEditableTextViewIsFirstResponder() async throws {
        _ = NSApplication.shared
        let (model, environment, original) = try await localTimedFixture()
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 300),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        addTeardownBlock {
            window.orderOut(nil)
            NSApp.keyWindow?.makeFirstResponder(nil)
        }
        let textView = NSTextView(frame: window.contentView!.bounds)
        textView.isEditable = true
        textView.string = "typing"
        window.contentView?.addSubview(textView)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        window.makeFirstResponder(textView)
        XCTAssertTrue((window.firstResponder as? NSTextView)?.isEditable == true)

        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        let router = try makeGridRouter(model: model)
        XCTAssertFalse(router.shiftArrow(.down, windowNumber: window.windowNumber))
        await assertFinishedNudgePersistence(model)
        let stored = try XCTUnwrap(
            environment.localEventRepository.fetchAll().first { $0.id == original.id }?.event
        )
        XCTAssertEqual(stored.schedule, original.schedule)
    }

    private func makeGridRouter(model: NativeCalendarRootModel) throws -> NativeGridKeyboardRouter {
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)
        return router
    }

    private static func decodeAllDayEvent(id: String) throws -> Event {
        let json = """
        {
          "id": "\(id)",
          "calendarId": "cal-1",
          "content": { "kind": "details", "title": "Offsite", "description": "" },
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-01T00:00:00.000Z",
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "allDay",
            "start": "2026-01-01",
            "end": "2026-01-02"
          }
        }
        """
        return try JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }

    private static func decodeTimedEvent(id: String) throws -> Event {
        let json = """
        {
          "id": "\(id)",
          "calendarId": "cal-1",
          "content": { "kind": "details", "title": "Meet", "description": "" },
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-01T00:00:00.000Z",
          "recurrence": { "kind": "single" },
          "schedule": {
            "kind": "timed",
            "start": "2026-01-01T10:00:00.000Z",
            "end": "2026-01-01T11:00:00.000Z",
            "timeZone": "UTC"
          }
        }
        """
        return try JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }

    private func localAllDayFixture() async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment, Event)
    {
        try await localFixture(sample: try Self.decodeAllDayEvent(id: "router-local-allday"))
    }

    private func localTimedFixture(canWrite: Bool = true) async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment, Event)
    {
        try await localFixture(sample: try Self.decodeTimedEvent(id: "router-local-event"), canWrite: canWrite)
    }

    private func assertFinishedNudgePersistence(
        _ model: NativeCalendarRootModel,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        let finished = await model.waitForPendingFocusedEventNudgeForTests()
        XCTAssertTrue(finished, file: (file), line: line)
    }

    private func localFixture(sample: Event, canWrite: Bool = true) async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment, Event)
    {
        let environment = try NativeCalendarEnvironment(
            appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: nil)
        )
        try environment.userMetadataRepository.upsert(key: DemoDataSeeder.migrationKey, value: true)
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
            id: sample.calendarId.rawValue,
            isActive: true,
            isPrimary: false,
            isVisible: true,
            name: "Shared",
            provider: "local",
            timeZone: "UTC"
        )
        try environment.calendarRepository.upsert(calendars: [calendar])
        let event = Event(
            calendarId: sample.calendarId,
            content: sample.content,
            createdAt: sample.createdAt,
            id: sample.id,
            recurrence: sample.recurrence,
            schedule: sample.schedule,
            updatedAt: sample.updatedAt
        )
        try environment.localEventRepository.put(.init(id: event.id, event: event, isDemo: false))
        let previousTimeZone = EffectiveTimeZone.identifier
        EffectiveTimeZone.identifier = "UTC"
        addTeardownBlock { EffectiveTimeZone.identifier = previousTimeZone }
        let model = NativeCalendarRootModel(environment: environment)
        model.viewStore.setPinnedTimeZone("UTC")
        model.viewStore.anchorDate = try XCTUnwrap(
            CompassDateParsing.parseInEffectiveTimeZone("2026-01-01T12:00:00.000Z")
        )
        await model.start()
        model.authStore.closeModal()
        model.onboardingStore.markWelcomeSeen(exit: "test")
        model.onboardingStore.setWelcomeFirstVisitOpen(false)
        NSApp.keyWindow?.makeFirstResponder(nil)
        await model.bootstrapLocalEventsForTests()
        if canWrite {
            XCTAssertFalse(model.isReadOnly(event: event))
        }
        XCTAssertNotNil(
            model.event(for: event.id),
            "bootstrap must load local event into model"
        )
        model.focusGridEvent(eventId: event.id.rawValue)
        XCTAssertEqual(model.focusStore.focusedEventId, event.id)
        return (model, environment, event)
    }
}

private extension NativeGridKeyboardRouter {
    enum Arrow {
        case up, down, left, right
    }

    func shiftArrow(_ arrow: Arrow, windowNumber: Int = 0) -> Bool {
        let keyCode: UInt16 = switch arrow {
        case .up: 126
        case .down: 125
        case .left: 123
        case .right: 124
        }
        guard let keyDown = NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: .shift,
            timestamp: 0,
            windowNumber: windowNumber,
            context: nil,
            characters: "",
            charactersIgnoringModifiers: "",
            isARepeat: false,
            keyCode: keyCode
        ) else {
            return false
        }
        return handleKeyDown(keyDown)
    }
}
