import AppKit
import CompassData
import CompassKit
import XCTest

/// Mouse-teach path: empty all-day click parks a day, then Shift+C must create a draft.
@MainActor
final class AllDayMouseCreateKeyboardTests: XCTestCase {
    func testShiftCAfterAllDaySlotClickCreatesDraftOnParkedDay() async throws {
        _ = NSApplication.shared
        let model = try await weekGridModel()
        model.handleGridPointerClick(
            target: .allDaySlot(dateKey: "2026-01-08"),
            registry: model.shortcutRegistry
        )
        XCTAssertEqual(model.pointerDraftDateKey, "2026-01-08")

        let router = try makeGridRouter(model: model)
        XCTAssertTrue(shiftC(router))

        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        XCTAssertEqual(draft.schedule.kind, .allDay)
        let parked = try XCTUnwrap(
            CompassDateParsing.calendarDateInEffectiveTimeZone("2026-01-08")
        )
        let day = EffectiveTimeZone.calendar.startOfDay(for: draft.schedule.start)
        XCTAssertEqual(day, EffectiveTimeZone.calendar.startOfDay(for: parked))
    }

    private func makeGridRouter(model: NativeCalendarRootModel) throws -> NativeGridKeyboardRouter {
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)
        return router
    }

    private func weekGridModel() async throws -> NativeCalendarRootModel {
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
        model.onboardingStore.markWelcomeSeen(exit: "test")
        model.onboardingStore.setWelcomeFirstVisitOpen(false)
        let welcomeKey = OnboardingStorageKeys.hasSeenWelcome
        let priorHasSeenWelcome = UserDefaults.standard.string(forKey: welcomeKey)
        addTeardownBlock {
            if let priorHasSeenWelcome {
                UserDefaults.standard.set(priorHasSeenWelcome, forKey: welcomeKey)
            } else {
                UserDefaults.standard.removeObject(forKey: welcomeKey)
            }
        }
        return model
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
