import CompassKit
import XCTest
@testable import CompassData

/// Mod+digit overlay chips must match web `PageJumpHintOverlay` rules: digits
/// come from `PageJumpTargets`, chips render only for mounted anchors, and hints
/// stay hidden until Mod hold (router-driven).
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

    func testLifeViewUsesLifePageJumpTargets() async throws {
        let model = try await makeModel()
        model.viewStore.view = .life
        model.rebuildPresentation()
        XCTAssertEqual(
            model.focusStore.pageJumpTargets.map(\.id),
            PageJumpTargets.buildLifePageJumpTargets().map(\.id)
        )
        XCTAssertEqual(model.focusStore.pageJumpTargets.map(\.digit), ["1", "2", "3", "4"])
    }

    func testLifePageJumpDigitTwoFocusesCurrentWeek() async throws {
        let model = try await makeModel()
        model.handleShortcut(.navLifeView)
        let tokenBefore = model.lifeStore.scrollToCurrentWeekToken
        model.focusPageJump(digit: "2")
        XCTAssertGreaterThan(model.lifeStore.scrollToCurrentWeekToken, tokenBefore)
    }

    func testLifePageJumpDigitThreeOpensSidebarVariationFocus() async throws {
        let model = try await makeModel()
        model.handleShortcut(.navLifeView)
        model.isSidebarOpen = false
        model.focusPageJump(digit: "3")
        XCTAssertTrue(model.isSidebarOpen)
        XCTAssertEqual(model.pendingLifePageJumpFocus, .variation)
    }

    func testLifePageJumpDigitFourOpensSidebarDetailsFocus() async throws {
        let model = try await makeModel()
        model.handleShortcut(.navLifeView)
        model.isSidebarOpen = false
        model.focusPageJump(digit: "4")
        XCTAssertTrue(model.isSidebarOpen)
        XCTAssertEqual(model.pendingLifePageJumpFocus, .details)
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
