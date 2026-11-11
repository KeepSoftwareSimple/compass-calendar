import AppKit
import CompassData
import CompassKit
import XCTest

@MainActor
final class CommandPaletteOverlayKeyboardTests: XCTestCase {
    func testEscapeClosesCommandPaletteWhileOverlayCaptureActive() async throws {
        _ = NSApplication.shared
        let model = NativeCalendarRootModel(
            environment: try NativeCalendarEnvironment(inMemoryDatabase: true),
            demoPresentation: try DemoSeedFixture.load())
        await model.start()
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)

        model.toggleCommandPalette()
        XCTAssertTrue(model.commandPaletteStore.isOpen)
        XCTAssertTrue(model.overlayKeyboardCaptureActive)

        let escape = try XCTUnwrap(
            NSEvent.keyEvent(
                with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0, windowNumber: 0,
                context: nil, characters: "", charactersIgnoringModifiers: "", isARepeat: false,
                keyCode: 53))
        XCTAssertTrue(router.handleKeyDown(escape))
        XCTAssertFalse(model.commandPaletteStore.isOpen)
    }
}
