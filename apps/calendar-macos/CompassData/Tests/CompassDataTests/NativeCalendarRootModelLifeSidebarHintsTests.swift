import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class NativeCalendarRootModelLifeSidebarHintsTests: XCTestCase {
    private var lifeDefaultsSuite: String!
    private var lifeDefaults: UserDefaults!

    override func setUp() {
        super.setUp()
        lifeDefaultsSuite = "NativeCalendarRootModelLifeSidebarHints.\(UUID().uuidString)"
        lifeDefaults = UserDefaults(suiteName: lifeDefaultsSuite)!
    }

    override func tearDown() {
        UserDefaults(suiteName: lifeDefaultsSuite)?.removePersistentDomain(forName: lifeDefaultsSuite)
        lifeDefaultsSuite = nil
        lifeDefaults = nil
        super.tearDown()
    }

    func testSuspendCalendarGridInteractionClearsKeyboardPlaceDraft() async throws {
        let model = try await makeModel()
        model.createTimedDraft(activity: .keyboardPlace)
        XCTAssertTrue(model.showsKeyboardPlaceSidebarHint)
        model.suspendCalendarGridInteraction()
        XCTAssertNil(model.draftStore.gridDraft)
        XCTAssertFalse(model.showsKeyboardPlaceSidebarHint)
    }

    func testLifeThisWeekSidebarTipRequiresBirthDate() async throws {
        let model = try await makeModel()
        model.handleShortcut(.navLifeView)
        XCTAssertFalse(model.showsLifeThisWeekSidebarTip)
        XCTAssertTrue(model.lifeStore.updateBirthDate("1990-01-01"))
        XCTAssertTrue(model.showsLifeThisWeekSidebarTip)
    }

    func testLifeWithoutBirthDateShowsCommandPaletteIdleTip() async throws {
        let model = try await makeModel()
        model.handleShortcut(.navLifeView)
        XCTAssertFalse(model.showsLifeThisWeekSidebarTip)
        XCTAssertEqual(model.lifeSidebarIdleTip, .commandPalette)
    }

    func testEnteringLifeDropsStaleKeyboardPlaceDraft() async throws {
        let model = try await makeModel()
        model.createTimedDraft(activity: .keyboardPlace)
        model.handleShortcut(.navLifeView)
        XCTAssertEqual(model.viewStore.view, .life)
        XCTAssertNil(model.draftStore.gridDraft)
        XCTAssertFalse(model.showsKeyboardPlaceSidebarHint)
    }

    private func makeModel() async throws -> NativeCalendarRootModel {
        let environment = try NativeCalendarEnvironment(
            appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: nil))
        let model = NativeCalendarRootModel(
            environment: environment,
            demoPresentation: try DemoSeedFixture.load(),
            lifeStoreDefaults: lifeDefaults)
        await model.start()
        return model
    }
}
