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
    }
}
