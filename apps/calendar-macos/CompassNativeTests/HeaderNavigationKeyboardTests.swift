import AppKit
import CompassData
import CompassKit
import XCTest

@MainActor
final class HeaderNavigationKeyboardTests: XCTestCase {
    func testHeaderOwnsTabAndActivationBeforeGridShortcuts() async throws {
        _ = NSApplication.shared
        let model = NativeCalendarRootModel(environment: try NativeCalendarEnvironment(inMemoryDatabase: true),
            demoPresentation: try DemoSeedFixture.load())
        await model.start()
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)
        model.isTitleBarControlFocused = true
        for (text, code, flags) in [("\t", UInt16(48), NSEvent.ModifierFlags()),
            ("\t", 48, .shift), ("\r", 36, []), (" ", 49, [])] {
            let event = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero,
                modifierFlags: flags, timestamp: 0, windowNumber: 0, context: nil,
                characters: text, charactersIgnoringModifiers: text, isARepeat: false, keyCode: code))
            XCTAssertFalse(router.handleKeyDown(event))
        }
        XCTAssertFalse(model.isEventFormVisible)
        model.isTitleBarControlFocused = false
        let tab = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero,
            modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil,
            characters: "\t", charactersIgnoringModifiers: "\t", isARepeat: false, keyCode: 48))
        XCTAssertTrue(router.handleKeyDown(tab), "Grid Tab keeps its existing edge-cycling shortcut")
    }
}
