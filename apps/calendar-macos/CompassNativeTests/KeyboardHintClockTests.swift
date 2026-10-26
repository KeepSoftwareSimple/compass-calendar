import AppKit
import CompassData
import CompassKit
import XCTest

@MainActor
final class KeyboardHintClockTests: XCTestCase {
    func testElapsedHoldRevealsPageHintsAndInactiveWindowClearsThem() async throws {
        let (model, router) = try await makeRouter()
        // flagsChanged is a modifier transition, not a character autorepeat.
        router.handleFlagsChanged(try commandDown(isRepeat: true))
        router.advanceKeyboardClock(by: 0.1, isActive: true)
        XCTAssertFalse(model.focusStore.pageJumpHintsVisible)
        router.advanceKeyboardClock(by: 0.2, isActive: true)
        XCTAssertTrue(model.focusStore.pageJumpHintsVisible)
        router.advanceKeyboardClock(by: 0, isActive: false)
        XCTAssertFalse(model.focusStore.pageJumpHintsVisible)
        router.advanceKeyboardClock(by: 1, isActive: true)
        XCTAssertFalse(model.focusStore.pageJumpHintsVisible)
    }

    func testModalCancelsPendingFormHints() async throws {
        let (model, router) = try await makeRouter()
        model.focusGridEvent(eventId: "demo-morning-standup")
        model.openKeyboardEditForFocusedEvent()
        router.handleFlagsChanged(try commandDown())
        router.advanceKeyboardClock(by: 0.3, isActive: true)
        XCTAssertTrue(model.formFieldDigitHintsVisible)
        model.settingsStore.open()
        router.advanceKeyboardClock(by: 0.1, isActive: true)
        XCTAssertFalse(model.formFieldDigitHintsVisible)
        XCTAssertFalse(model.focusStore.pageJumpHintsVisible)
    }

    private func makeRouter() async throws -> (NativeCalendarRootModel, NativeGridKeyboardRouter) {
        _ = NSApplication.shared
        let environment = try NativeCalendarEnvironment(appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true, sessionStore: MemorySessionStore())
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        return (model, NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry()))
    }

    private func commandDown(isRepeat: Bool = false) throws -> NSEvent {
        try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: .command,
            timestamp: 0, windowNumber: 0, context: nil, characters: "",
            charactersIgnoringModifiers: "", isARepeat: isRepeat, keyCode: 55))
    }
}
