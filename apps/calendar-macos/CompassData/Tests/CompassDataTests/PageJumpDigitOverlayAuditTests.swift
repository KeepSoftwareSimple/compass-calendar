import CompassKit
import XCTest
@testable import CompassData

/// Audit: Mod+digit overlay chips must match web `PageJumpHintOverlay` rules:
/// digits come from `PageJumpTargets`, chips render only for anchored sections
/// (`ModHoldChipsOverlay`), and hints stay hidden until Mod hold (router-driven).
@MainActor
final class PageJumpDigitOverlayAuditTests: XCTestCase {
    func testPageJumpHintsHiddenUntilModHold() async throws {
        let model = try await makeModel()
        model.rebuildPresentation()
        XCTAssertFalse(model.focusStore.pageJumpHintsVisible)
    }

    func testWeekSidebarDigitsMatchPageJumpTargetsBuilder() async throws {
        let model = try await makeModel()
        model.viewStore.view = .week
        model.rebuildPresentation()
        let expected = PageJumpTargets.buildSidebarPageJumpTargets().map(\.digit)
        XCTAssertEqual(model.focusStore.pageJumpTargets.map(\.digit), expected)
    }

    func testLifeViewStillUsesCalendarSidebarJumpMap() async throws {
        let model = try await makeModel()
        model.viewStore.view = .life
        model.rebuildPresentation()
        XCTAssertEqual(
            model.focusStore.pageJumpTargets.map(\.id),
            PageJumpTargets.buildSidebarPageJumpTargets().map(\.id),
            "Life-specific LIFE_PAGE_JUMP_TARGETS are not wired on macOS yet; chips must not invent other digits."
        )
    }

    private func makeModel() async throws -> NativeCalendarRootModel {
        let environment = try NativeCalendarEnvironment(
            inMemoryDatabase: true, sessionStore: MemorySessionStore(tokens: nil))
        let model = NativeCalendarRootModel(
            environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        return model
    }
}
