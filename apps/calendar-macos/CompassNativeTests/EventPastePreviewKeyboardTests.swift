import AppKit
@testable import CompassData
import CompassKit
import XCTest

@MainActor
final class EventPastePreviewKeyboardTests: XCTestCase {
    func testCopyWithoutFocusedEventDoesNotConsumeShortcut() async throws {
        _ = NSApplication.shared
        let model = NativeCalendarRootModel(
            environment: try NativeCalendarEnvironment(inMemoryDatabase: true),
            demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.viewStore.view = .week
        model.focusStore.resetEdgeFocus()
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)

        XCTAssertFalse(router.handleKeyDown(try key("c", code: 8, modifiers: .command)))
        XCTAssertFalse(model.pastePreviewStore.isActive)
    }

    func testPasteCreatesDuplicateAfterArrowNudge() async throws {
        _ = NSApplication.shared
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first {
            if case .details(let details) = $0.content { return !details.title.isEmpty }
            return false
        })
        let sourceTitle: String = {
            guard case .details(let details) = event.content else { return "" }
            return details.title
        }()
        let originalDay = EventOnTargetDay.startDay(for: event)
        model.focusEvent(eventId: event.id.rawValue)
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)

        XCTAssertTrue(router.handleKeyDown(try key("c", code: 8, modifiers: .command)))
        XCTAssertEqual(model.draftStore.status.activity, .pastePlace)
        XCTAssertFalse(model.eventJumpSelection.isActive)

        let before = model.loadedEvents.filter {
            guard case .details(let d) = $0.content else { return false }
            return d.title == sourceTitle
        }.count
        XCTAssertEqual(before, 1)

        XCTAssertTrue(model.nudgeDraftOrPlace(key: "ArrowLeft", shiftKey: false, altKey: false))
        XCTAssertTrue(router.handleKeyDown(try key("v", code: 9, modifiers: .command)))

        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
            let matches = model.loadedEvents.filter {
                guard case .details(let d) = $0.content else { return false }
                return d.title == sourceTitle
            }
            if matches.count == 2 { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }

        let copies = model.loadedEvents.filter {
            guard case .details(let d) = $0.content else { return false }
            return d.title == sourceTitle
        }
        XCTAssertEqual(copies.count, 2)
        XCTAssertTrue(copies.contains {
            !Calendar.current.isDate(EventOnTargetDay.startDay(for: $0), inSameDayAs: originalDay)
        })
    }

    func testEnterDuringPastePlaceDoesNotOpenForm() async throws {
        _ = NSApplication.shared
        let model = NativeCalendarRootModel(
            environment: try NativeCalendarEnvironment(inMemoryDatabase: true),
            demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first)
        model.focusEvent(eventId: event.id.rawValue)
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)

        XCTAssertTrue(router.handleKeyDown(try key("c", code: 8, modifiers: .command)))
        XCTAssertEqual(model.draftStore.status.activity, .pastePlace)
        XCTAssertFalse(model.isEventFormVisible)

        XCTAssertTrue(router.handleKeyDown(try key("\r", code: 36)))
        XCTAssertFalse(model.isEventFormVisible)
        XCTAssertEqual(model.draftStore.status.activity, .pastePlace)
    }

    func testFallbackPasteUsesDraftTargetDayAfterEscape() async throws {
        _ = NSApplication.shared
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first {
            if case .details(let details) = $0.content { return !details.title.isEmpty }
            return false
        })
        let title: String = {
            guard case .details(let details) = event.content else { return "" }
            return details.title
        }()
        model.focusEvent(eventId: event.id.rawValue)
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)

        XCTAssertTrue(router.handleKeyDown(try key("c", code: 8, modifiers: .command)))
        XCTAssertTrue(router.handleKeyDown(try key("\u{1b}", code: 53)))
        XCTAssertFalse(model.pastePreviewStore.isActive)

        let targetDay = Calendar.current.date(byAdding: .day, value: 2, to: EventOnTargetDay.startDay(for: event))!
        model.eventJumpSelection.selectDay(
            key: CompassDateParsing.formatCalendarDay(targetDay),
            announcement: "",
            buffer: ""
        )

        XCTAssertTrue(router.handleKeyDown(try key("v", code: 9, modifiers: .command)))

        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
            let matches = model.loadedEvents.filter {
                guard case .details(let d) = $0.content else { return false }
                return d.title == title
            }
            if matches.count == 2 { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }

        let copies = model.loadedEvents.filter {
            guard case .details(let d) = $0.content else { return false }
            return d.title == title
        }
        XCTAssertEqual(copies.count, 2)
        XCTAssertTrue(copies.contains {
            Calendar.current.isDate(EventOnTargetDay.startDay(for: $0), inSameDayAs: targetDay)
        })
    }

    func testEscapeEndsPastePreviewFromKeyboard() async throws {
        _ = NSApplication.shared
        let model = NativeCalendarRootModel(
            environment: try NativeCalendarEnvironment(inMemoryDatabase: true),
            demoPresentation: try DemoSeedFixture.load())
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
