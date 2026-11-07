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

        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        XCTAssertTrue(try router.shiftArrow(.down))

        await model.waitForPendingFocusedEventNudgeForTests()
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

    func testRouterShiftArrowUpNudgesFocusedTimedEndEdge() async throws {
        _ = NSApplication.shared
        let (model, _, original) = try await localTimedFixture()
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .endDate,
            announcement: "Editing end time",
            isAllDay: false
        )
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        XCTAssertTrue(try router.shiftArrow(.up))
        await model.waitForPendingFocusedEventNudgeForTests()

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
        model.focusStore.setEdge(
            eventId: original.id,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        _ = try router.shiftArrow(.down)
        await model.waitForPendingFocusedEventNudgeForTests()
        let stored = try XCTUnwrap(
            environment.localEventRepository.fetchAll().first { $0.id == original.id }?.event
        )
        XCTAssertEqual(stored.schedule, original.schedule)
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

    private func localTimedFixture(canWrite: Bool = true) async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment, Event)
    {
        let environment = try NativeCalendarEnvironment(
            appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: nil)
        )
        try environment.userMetadataRepository.upsert(key: DemoDataSeeder.migrationKey, value: true)
        let sample = try Self.decodeTimedEvent(id: "router-local-event")
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
        try environment.localEventRepository.put(.init(id: sample.id, event: sample, isDemo: false))
        let model = NativeCalendarRootModel(environment: environment)
        model.viewStore.setPinnedTimeZone("UTC")
        model.viewStore.anchorDate = try XCTUnwrap(
            CompassDateParsing.parseInEffectiveTimeZone("2026-01-01T12:00:00.000Z")
        )
        await model.start()
        model.authStore.closeModal()
        await model.bootstrapLocalEventsForTests()
        model.updateContentTrackWidth(800)
        model.focusGridEvent(eventId: sample.id.rawValue)
        return (model, environment, sample)
    }
}

private extension NativeGridKeyboardRouter {
    enum Arrow {
        case up, down, left, right
    }

    func shiftArrow(_ arrow: Arrow) throws -> Bool {
        let keyCode: UInt16 = switch arrow {
        case .up: 126
        case .down: 125
        case .left: 123
        case .right: 124
        }
        let keyDown = try XCTUnwrap(
            NSEvent.keyEvent(
                with: .keyDown,
                location: .zero,
                modifierFlags: .shift,
                timestamp: 0,
                windowNumber: 0,
                context: nil,
                characters: "",
                charactersIgnoringModifiers: "",
                isARepeat: false,
                keyCode: keyCode
            )
        )
        return handleKeyDown(keyDown)
    }
}
