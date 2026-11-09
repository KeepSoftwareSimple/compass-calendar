import AppKit
import CompassData
import CompassKit
import XCTest

@MainActor
final class EventPastePreviewKeyboardTests: XCTestCase {
    func testCopyAndPasteKeyboardShortcutsDrivePastePreview() async throws {
        _ = NSApplication.shared
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first {
            if case .details(let details) = $0.content { return !details.title.isEmpty }
            return false
        })
        model.focusEvent(eventId: event.id.rawValue)
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)

        let copy = try key("c", code: 8, modifiers: .command)
        XCTAssertTrue(router.handleKeyDown(copy))
        XCTAssertTrue(model.pastePreviewStore.isActive)

        let paste = try key("v", code: 9, modifiers: .command)
        XCTAssertTrue(router.handleKeyDown(paste))
        XCTAssertFalse(model.pastePreviewStore.isActive)
    }

    func testEscapeEndsPastePreviewFromKeyboard() async throws {
        _ = NSApplication.shared
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first)
        model.focusEvent(eventId: event.id.rawValue)
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)

        XCTAssertTrue(router.handleKeyDown(try key("c", code: 8, modifiers: .command)))
        XCTAssertTrue(model.pastePreviewStore.isActive)

        XCTAssertTrue(router.handleKeyDown(try key("\u{1b}", code: 53)))
        XCTAssertFalse(model.pastePreviewStore.isActive)
        XCTAssertNotNil(model.clipboardStore.event)
    }

    private func key(_ characters: String, code: UInt16, modifiers: NSEvent.ModifierFlags = []) throws -> NSEvent {
        try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: modifiers,
            timestamp: 0, windowNumber: 0, context: nil, characters: characters,
            charactersIgnoringModifiers: characters, isARepeat: false, keyCode: code))
    }
}
