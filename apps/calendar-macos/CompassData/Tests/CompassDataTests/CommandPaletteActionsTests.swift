import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class CommandPaletteActionsTests: XCTestCase {
    private var savedDefaults: [String: Any] = [:]
    private var previousTimeZone = "UTC"
    private let keys = [RecentCommandsPersistence.storageKey,
        ShortcutUsageStorageKeys.personalization, ShortcutUsageStorageKeys.levelHidden,
        ShortcutUsageStorageKeys.levelCelebrated, ShortcutUsageStorageKeys.tipRotationIndex]

    override func setUp() async throws {
        previousTimeZone = EffectiveTimeZone.identifier
        for key in keys {
            savedDefaults[key] = UserDefaults.standard.object(forKey: key)
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    override func tearDown() async throws {
        for key in keys {
            if let value = savedDefaults[key] { UserDefaults.standard.set(value, forKey: key) }
            else { UserDefaults.standard.removeObject(forKey: key) }
        }
        savedDefaults = [:]
        EffectiveTimeZone.identifier = previousTimeZone
    }

    func testCreateRowsOpenTimedAndAllDayForms() async throws {
        let model = try await makeModel()
        for (id, kind) in [("create-event", DraftSchedule.Kind.timed), ("create-allday-event", .allDay)] {
            model.commandPaletteStore.open()
            model.runPaletteCommand(id: id)
            XCTAssertFalse(model.commandPaletteStore.isOpen)
            let draft = try XCTUnwrap(model.draftStore.gridDraft)
            XCTAssertEqual(draft.schedule.kind, kind)
            XCTAssertTrue(model.isEventFormVisible)
            model.draftStore.discard()
        }
    }

    func testCreateShortcutsDoNotDraftBehindSettingsOrAuthentication() async throws {
        let model = try await makeModel()
        model.settingsStore.open()
        model.handleShortcut(.createTimed)
        XCTAssertNil(model.draftStore.gridDraft)
        model.settingsStore.close()
        model.authStore.openModal(.login)
        model.handleShortcut(.createAllday)
        XCTAssertNil(model.draftStore.gridDraft)
    }

    func testCreationFromLifeViewReturnsToCalendar() async throws {
        let model = try await makeModel()
        model.viewStore.view = .life
        model.runPaletteCommand(id: "create-event")
        XCTAssertEqual(model.viewStore.view, .week)
        XCTAssertNotNil(model.draftStore.gridDraft)
    }

    func testSelectionWrapsAndResetsWhenQueryChanges() async throws {
        let model = try await makeModel()
        model.commandPaletteStore.open()
        let items = model.filteredPaletteSections().flatMap(\.items)
        XCTAssertEqual(model.selectedPaletteItemId, items.first?.id)
        model.movePaletteSelection(by: -1)
        XCTAssertEqual(model.selectedPaletteItemId, items.last?.id)
        model.movePaletteSelection(by: 1)
        XCTAssertEqual(model.selectedPaletteItemId, items.first?.id)
        model.movePaletteSelection(by: 1)
        XCTAssertEqual(model.selectedPaletteItemId, items[1].id)
        model.commandPaletteStore.query = "settings"
        XCTAssertEqual(model.selectedPaletteItemId, "open-settings")
        model.activatePaletteSelection()
        XCTAssertTrue(model.settingsStore.isPresented)
        XCTAssertFalse(model.commandPaletteStore.isOpen)
    }

    func testEmptyResultsCannotActivateAnOldSelection() async throws {
        let model = try await makeModel()
        model.commandPaletteStore.open()
        model.movePaletteSelection(by: 1)
        model.commandPaletteStore.query = "no-match-a9z8x7"
        XCTAssertNil(model.selectedPaletteItemId)
        model.activatePaletteSelection()
        XCTAssertTrue(model.commandPaletteStore.isOpen)
    }

    func testRecentRowsHaveUniqueIdentityAndRunTheUnderlyingCommand() async throws {
        let model = try await makeModel()
        model.commandPaletteStore.recordSelection(commandId: "today")
        model.commandPaletteStore.open()
        let ids = model.filteredPaletteSections().flatMap(\.items).map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count)
        XCTAssertTrue(ids.contains("recent-today"))
        model.commandPaletteStore.select(commandId: "recent-today")
        model.activatePaletteSelection()
        XCTAssertFalse(model.commandPaletteStore.isOpen)
        XCTAssertEqual(model.commandPaletteStore.recentCommandIds.first, "today")
        XCTAssertFalse(model.commandPaletteStore.recentCommandIds.contains("recent-today"))
    }

    func testSectionsFollowWebOrderAndHeadings() async throws {
        let model = try await makeModel()
        model.commandPaletteStore.open()
        let sections = model.filteredPaletteSections()
        XCTAssertEqual(
            sections.map(\.heading),
            ["Navigation", "Common Actions", "Appearance", "Settings", "More"])
        let ids = Set(sections.flatMap(\.items).map(\.id))
        for id in [
            "undo-last-change", "redo-last-change", "toggle-theme", "focus-month-picker",
            "open-up-next", "join-up-next-meeting", "change-default-timezone", "time-travel",
            "sign-up", "log-in", "share-feedback", "book-personal-onboarding", "about",
        ] {
            XCTAssertTrue(ids.contains(id), id)
        }
        XCTAssertFalse(ids.contains("log-out"))
    }

    func testDisabledRowsAreSkippedAndCannotRun() async throws {
        let model = try await makeModel()
        model.commandPaletteStore.open()
        let undo = try XCTUnwrap(model.filteredPaletteSections().flatMap(\.items).first { $0.id == "undo-last-change" })
        XCTAssertTrue(undo.isDisabled)
        model.commandPaletteStore.query = "undo last"
        XCTAssertNotEqual(model.selectedPaletteItemId, "undo-last-change")
        model.runPaletteCommand(id: "undo-last-change")
        XCTAssertTrue(model.commandPaletteStore.isOpen)
    }

    func testRecentRowsAreCappedAndHiddenWhileSearching() async throws {
        let model = try await makeModel()
        for id in ["today", "about", "toggle-theme", "open-settings"] {
            model.commandPaletteStore.recordSelection(commandId: id)
        }
        model.commandPaletteStore.open()
        let recent = model.filteredPaletteSections().first { $0.id == "recent" }
        XCTAssertEqual(recent?.items.count, 3)
        model.commandPaletteStore.query = "about"
        XCTAssertNil(model.filteredPaletteSections().first { $0.id == "recent" })
    }

    func testOnboardingRowOpensExternalURL() async throws {
        let model = try await makeModel()
        var opened: URL?
        model.openExternalURLHandler = { opened = $0 }
        model.runPaletteCommand(id: "book-personal-onboarding")
        XCTAssertEqual(opened, CommandPaletteCatalog.personalOnboardingURL)
    }

    func testClearSampleEventsRemovesDemoRows() async throws {
        let model = try await makeModel()
        XCTAssertTrue(model.hasSampleEvents)
        await model.clearSampleEvents()
        XCTAssertFalse(model.hasSampleEvents)
        XCTAssertTrue(try model.environment.localEventRepository.demoEventIds().isEmpty)
    }

    func testToggleThemeFlipsStoredTheme() async throws {
        let model = try await makeModel()
        let initial = model.settingsStore.theme
        model.runPaletteCommand(id: "toggle-theme")
        XCTAssertNotEqual(model.settingsStore.theme, initial)
    }

    func testAboutInvokesNativePresentation() async throws {
        let model = try await makeModel()
        var presented = false
        model.onShowAbout = { presented = true }
        model.commandPaletteStore.open()
        model.runPaletteCommand(id: "about")
        XCTAssertTrue(presented)
        XCTAssertFalse(model.commandPaletteStore.isOpen)
    }

    func testOpeningCommandPaletteHidesPointerHint() async throws {
        let model = try await makeModel()
        model.pointerHintStore.pulse(
            target: .timedSlot,
            registry: model.shortcutRegistry,
            slotClick: GridPointerSlotClickContext(timeKey: "0900", timeLabel: "9:00 AM"))
        XCTAssertTrue(model.pointerHintStore.isVisible)
        model.toggleCommandPalette()
        XCTAssertFalse(model.pointerHintStore.isVisible)
        XCTAssertTrue(model.commandPaletteStore.isOpen)
    }

    private func makeModel() async throws -> NativeCalendarRootModel {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true, sessionStore: MemorySessionStore(tokens: nil))
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        return model
    }
}
