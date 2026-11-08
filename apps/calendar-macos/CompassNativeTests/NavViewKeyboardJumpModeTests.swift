import AppKit
import CompassKit
import XCTest
@testable import CompassData

/// Tyler 6:51 PM: bare W must return to week while event-jump mode is still on.
@MainActor
final class NavViewKeyboardJumpModeTests: XCTestCase {
    func testWeekShortcutSwitchesViewWhileEventJumpModeActive() async throws {
        _ = NSApplication.shared
        let model = NativeCalendarRootModel(
            environment: try NativeCalendarEnvironment(inMemoryDatabase: true),
            demoPresentation: try DemoSeedFixture.load()
        )
        await model.start()
        model.onboardingStore.markWelcomeSeen(exit: "test")
        model.onboardingStore.setWelcomeFirstVisitOpen(false)
        NSApp.keyWindow?.makeFirstResponder(nil)

        let router = try makeGridRouter(model: model)
        XCTAssertTrue(pressW(router: router))
        XCTAssertEqual(model.viewStore.view, .week)

        XCTAssertTrue(pressD(router: router))
        XCTAssertEqual(model.viewStore.view, .day)

        model.toggleEventJumpMode()
        XCTAssertTrue(model.eventJumpSelection.modeActive)

        XCTAssertTrue(pressW(router: router))
        XCTAssertEqual(model.viewStore.view, .week)
        XCTAssertFalse(model.eventJumpSelection.modeActive)
    }

    private func makeGridRouter(model: NativeCalendarRootModel) throws -> NativeGridKeyboardRouter {
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)
        return router
    }

    private func pressW(router: NativeGridKeyboardRouter) -> Bool {
        keyDown(router: router, characters: "w", keyCode: 13)
    }

    private func pressD(router: NativeGridKeyboardRouter) -> Bool {
        keyDown(router: router, characters: "d", keyCode: 2)
    }

    private func keyDown(router: NativeGridKeyboardRouter, characters: String, keyCode: UInt16) -> Bool {
        guard let event = NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: [],
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            characters: characters,
            charactersIgnoringModifiers: characters,
            isARepeat: false,
            keyCode: keyCode
        ) else {
            return false
        }
        return router.handleKeyDown(event)
    }
}
