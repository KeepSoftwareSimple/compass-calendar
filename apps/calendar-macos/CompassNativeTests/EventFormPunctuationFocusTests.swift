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
        XCTAssertEqual(model.eventFormFocusRequest, 1)
        for (letter, code) in [("e", UInt16(14)), ("g", UInt16(5))] {
            let key = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero,
                modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil,
                characters: letter, charactersIgnoringModifiers: letter, isARepeat: false, keyCode: code))
            _ = router.handleKeyDown(key)
            if letter == "e" { XCTAssertEqual(router.dispatcher.leaderEngine.phase, .armedSilent) }
            if letter == "g" { XCTAssertEqual(router.dispatcher.lastResolvedLeaderField, "rsvp") }
        }
        XCTAssertEqual(model.eventFormFocusedField, .rsvp)
        XCTAssertEqual(model.eventFormFocusRequest, 2)
    }

    func testCommandEnterSaveWhileEditableTextIsFirstResponderWithFormOpen() async throws {
        _ = NSApplication.shared
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment,
            demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.focusGridEvent(eventId: "demo-morning-standup")
        model.openKeyboardEditForFocusedEvent()
        model.openEventFormForCurrentDraft()
        XCTAssertTrue(model.isEventFormVisible)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 200),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        addTeardownBlock { window.orderOut(nil) }
        let textView = NSTextView(frame: window.contentView!.bounds)
        textView.isEditable = true
        window.contentView?.addSubview(textView)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        window.makeFirstResponder(textView)

        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)
        let enter = try XCTUnwrap(NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: .command,
            timestamp: 0,
            windowNumber: window.windowNumber,
            context: nil,
            characters: "\r",
            charactersIgnoringModifiers: "\r",
            isARepeat: false,
            keyCode: 36
        ))
        XCTAssertTrue(router.handleKeyDown(enter))
    }
}
