import AppKit
import CompassData
import CompassKit
import XCTest

/// Web `useShiftHoldEventHints`: bare `f` latches event-jump mode (chips + quick-time preview).
@MainActor
final class NativeGridKeyboardRouterEventJumpTests: XCTestCase {
    func testBareFActivatesEventJumpModeAndShowsQuickTimePreview() async throws {
        let (model, router) = try await makeRouter()
        XCTAssertFalse(model.eventJumpSelection.modeActive)

        let fDown = try keyDown("f", code: 3)
        XCTAssertTrue(router.handleKeyDown(fDown))
        XCTAssertTrue(model.eventJumpSelection.modeActive)
        XCTAssertFalse(model.timeGridState.quickTimeSlotHints.isEmpty,
            "Empty-day jump mode should surface quick-time slot previews like web")
    }

    func testBareFDoesNotActivateWhileEventFormIsOpen() async throws {
        let (model, router) = try await makeRouter()
        model.focusGridEvent(eventId: "demo-morning-standup")
        model.openKeyboardEditForFocusedEvent()
        model.openEventFormForCurrentDraft()
        XCTAssertTrue(model.isEventFormVisible)

        let fDown = try keyDown("f", code: 3)
        _ = router.handleKeyDown(fDown)
        XCTAssertFalse(
            model.eventJumpSelection.modeActive,
            "Bare f must not latch event-jump while the event form is open")
    }

    func testEscapeDismissesEventJumpMode() async throws {
        let (model, router) = try await makeRouter()
        XCTAssertTrue(router.handleKeyDown(try keyDown("f", code: 3)))
        XCTAssertTrue(model.eventJumpSelection.modeActive)

        let escape = try XCTUnwrap(NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: [],
            timestamp: 0, windowNumber: 0, context: nil,
            characters: "\u{1b}", charactersIgnoringModifiers: "\u{1b}",
            isARepeat: false, keyCode: 53))
        XCTAssertTrue(router.handleKeyDown(escape))
        XCTAssertFalse(model.eventJumpSelection.modeActive)
        XCTAssertFalse(model.eventJumpSelection.isActive)
    }

    private func makeRouter() async throws -> (NativeCalendarRootModel, NativeGridKeyboardRouter) {
        _ = NSApplication.shared
        let environment = try NativeCalendarEnvironment(
            appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore())
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)
        return (model, router)
    }

    private func keyDown(_ characters: String, code: UInt16) throws -> NSEvent {
        try XCTUnwrap(NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: [],
            timestamp: 0, windowNumber: 0, context: nil,
            characters: characters, charactersIgnoringModifiers: characters,
            isARepeat: false, keyCode: code))
    }
}
