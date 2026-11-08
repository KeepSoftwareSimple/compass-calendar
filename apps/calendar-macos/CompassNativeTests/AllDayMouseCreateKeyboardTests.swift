import AppKit
import CompassKit
import XCTest
@testable import CompassData

/// Mouse-teach path: empty all-day click parks a day, then Shift+C must create a draft.
@MainActor
final class AllDayMouseCreateKeyboardTests: XCTestCase {
    func testShiftCAfterAllDaySlotClickCreatesDraftOnParkedDay() async throws {
        _ = NSApplication.shared
        let (model, _) = try await weekGridModel()
        model.handleGridPointerClick(
            target: .allDaySlot(dateKey: "2026-01-08"),
            registry: model.shortcutRegistry
        )
        XCTAssertEqual(model.pointerDraftDateKey, "2026-01-08")

        let router = try makeGridRouter(model: model)
        XCTAssertTrue(router.shiftC())

        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        XCTAssertEqual(draft.schedule.kind, .allDay)
        let parked = try XCTUnwrap(
            CompassDateParsing.calendarDateInEffectiveTimeZone("2026-01-08")
        )
        let day = EffectiveTimeZone.calendar.startOfDay(for: draft.schedule.start)
        XCTAssertEqual(day, EffectiveTimeZone.calendar.startOfDay(for: parked))
    }

    func testShiftCAfterAllDayClickPersistsSavedAllDayEvent() async throws {
        _ = NSApplication.shared
        let (model, environment) = try await weekGridModel()
        model.handleGridPointerClick(
            target: .allDaySlot(dateKey: "2026-01-08"),
            registry: model.shortcutRegistry
        )
        let router = try makeGridRouter(model: model)
        XCTAssertTrue(router.shiftC())
        model.setDraftTitle("Parked all-day")
        await model.saveDraft()

        let stored = try environment.localEventRepository.fetchAll()
        let saved = try XCTUnwrap(stored.first(where: { record in
            guard case .details(let details) = record.event.content else { return false }
            return details.title == "Parked all-day"
        }))
        guard case .allDay(let schedule) = saved.event.schedule else {
            return XCTFail("Expected persisted all-day schedule")
        }
        XCTAssertEqual(schedule.start, "2026-01-08")
        XCTAssertEqual(schedule.end, "2026-01-09")
    }

    private func makeGridRouter(model: NativeCalendarRootModel) throws -> NativeGridKeyboardRouter {
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)
        return router
    }

    private func weekGridModel() async throws
        -> (NativeCalendarRootModel, NativeCalendarEnvironment)
    {
        let environment = try NativeCalendarEnvironment(
            appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: nil)
        )
        try environment.userMetadataRepository.upsert(key: DemoDataSeeder.migrationKey, value: true)
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
            id: "cal-1",
            isActive: true,
            isPrimary: true,
            isVisible: true,
            name: "Local",
            provider: "local",
            timeZone: "UTC"
        )
        try environment.calendarRepository.upsert(calendars: [calendar])
        let previousTimeZone = EffectiveTimeZone.identifier
        EffectiveTimeZone.identifier = "UTC"
        addTeardownBlock { EffectiveTimeZone.identifier = previousTimeZone }
        let model = NativeCalendarRootModel(environment: environment)
        model.viewStore.setPinnedTimeZone("UTC")
        model.viewStore.anchorDate = try XCTUnwrap(
            CompassDateParsing.parseInEffectiveTimeZone("2026-01-01T12:00:00.000Z")
        )
        model.settingsStore.setDefaultCalendarId("cal-1")
        await model.start()
        model.authStore.closeModal()
        restoreWelcomeDefaultsAfterTeardown()
        model.onboardingStore.markWelcomeSeen(exit: "test")
        model.onboardingStore.setWelcomeFirstVisitOpen(false)
        NSApp.keyWindow?.makeFirstResponder(nil)
        return (model, environment)
    }

    private func restoreWelcomeDefaultsAfterTeardown() {
        let hasSeenKey = OnboardingStorageKeys.hasSeenWelcome
        let exitKey = OnboardingStorageKeys.welcomeExit
        let priorHasSeen = UserDefaults.standard.string(forKey: hasSeenKey)
        let priorExit = UserDefaults.standard.string(forKey: exitKey)
        addTeardownBlock {
            if let priorHasSeen {
                UserDefaults.standard.set(priorHasSeen, forKey: hasSeenKey)
            } else {
                UserDefaults.standard.removeObject(forKey: hasSeenKey)
            }
            if let priorExit {
                UserDefaults.standard.set(priorExit, forKey: exitKey)
            } else {
                UserDefaults.standard.removeObject(forKey: exitKey)
            }
        }
    }
}

private extension NativeGridKeyboardRouter {
    func shiftC() -> Bool {
        guard let keyDown = NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: .shift,
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            characters: "c",
            charactersIgnoringModifiers: "C",
            isARepeat: false,
            keyCode: 8
        ) else {
            return false
        }
        return handleKeyDown(keyDown)
    }
}
