import AppKit
import CompassData
import CompassKit
import XCTest

@MainActor
final class EventFormPunctuationFocusTests: XCTestCase {
    func testCommandMinusRoutesRealPunctuationTokenToRsvp() async throws {
        _ = NSApplication.shared
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment,
            demoPresentation: try DemoSeedFixture.load().attendeeVariant())
        await model.start()
        model.focusGridEvent(eventId: "demo-morning-standup")
        model.openKeyboardEditForFocusedEvent()
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)
        let event = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero,
            modifierFlags: .command, timestamp: 0, windowNumber: 0, context: nil,
            characters: "-", charactersIgnoringModifiers: "-", isARepeat: false, keyCode: 27))
        XCTAssertTrue(router.handleKeyDown(event))
        XCTAssertEqual(model.eventFormFocusedField, .rsvp)
        XCTAssertEqual(model.eventFormRsvpFocusRequest, 1)
        for (letter, code) in [("e", UInt16(14)), ("g", UInt16(5))] {
            let key = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero,
                modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil,
                characters: letter, charactersIgnoringModifiers: letter, isARepeat: false, keyCode: code))
            _ = router.handleKeyDown(key)
        }
        XCTAssertEqual(model.eventFormFocusedField, .rsvp)
        XCTAssertEqual(model.eventFormRsvpFocusRequest, 2)
    }
}
