import AppKit
import CompassData
import CompassKit
import SwiftUI
import XCTest
@testable import CompassUI

@MainActor
final class DescriptionLinkDigitKeyboardRouterTests: XCTestCase {
    private var openedURL: String?

    override func setUp() async throws {
        openedURL = nil
        DescriptionLinkKeyboard.openURLForTests = { [weak self] url in self?.openedURL = url.absoluteString }
        _ = NSApplication.shared
    }

    override func tearDown() async throws {
        DescriptionLinkKeyboard.openURLForTests = nil
        openedURL = nil
    }

    func testBareDigitOpensFirstLinkWhenHintsActiveAndScheduleFieldFocused() async throws {
        let (model, router) = try await makeRouterWithDescriptionLinkHints()
        model.eventFormFocusedField = .start
        XCTAssertTrue(router.handleKeyDown(try keyDown("1")))
        XCTAssertEqual(openedURL, "https://one.example/meeting/a")
    }

    func testBareDigitIgnoredWhileTitleFieldFocused() async throws {
        let (model, router) = try await makeRouterWithDescriptionLinkHints()
        model.eventFormFocusedField = .title
        XCTAssertFalse(router.handleKeyDown(try keyDown("1")))
        XCTAssertNil(openedURL)
    }

    func testBareDigitIgnoredWhileColorFieldFocused() async throws {
        let (model, router) = try await makeRouterWithDescriptionLinkHints()
        model.eventFormFocusedField = .color
        XCTAssertTrue(router.handleKeyDown(try keyDown("3")))
        XCTAssertNil(openedURL)
        XCTAssertEqual(model.colorSwatchFocusIndex, 2)
    }

    func testCommandDigitStillJumpsFormFieldWhenHintsVisible() async throws {
        let (model, router) = try await makeRouterWithDescriptionLinkHints()
        model.eventFormFocusedField = .start
        XCTAssertTrue(router.handleKeyDown(try keyDown("1", modifiers: .command)))
        XCTAssertNil(openedURL)
        XCTAssertEqual(model.eventFormFocusedField, .title)
    }

    private func makeRouterWithDescriptionLinkHints() async throws -> (NativeCalendarRootModel, NativeGridKeyboardRouter) {
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment,
            demoPresentation: try DemoSeedFixture.load().attendeeVariant())
        await model.start()
        model.focusGridEvent(eventId: "demo-morning-standup")
        model.openKeyboardEditForFocusedEvent()
        model.updateDraftFromForm(
            description: "<p><a href=\"https://one.example/meeting/a\">https://one.example/meeting/a</a></p>")
        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        router.dispatcher.pushScope(.grid)

        let html = model.draftStore.gridDraft?.description ?? ""
        var bound = html
        let coordinator = DescriptionEditorView.Coordinator(html: Binding(get: { bound }, set: { bound = $0 }))
        let container = DescriptionEditorContainerView(frame: NSRect(x: 0, y: 0, width: 420, height: 140))
        let editor = container.textView
        coordinator.textView = editor
        coordinator.container = container
        editor.delegate = coordinator
        coordinator.load(html: html, resetKey: "demo-morning-standup")
        coordinator.wasDescriptionFocused = true
        coordinator.syncPresentationOnFocusChange(isFocused: false, html: html, resetKey: "demo-morning-standup")
        XCTAssertTrue(coordinator.shouldShowLinkHintOverlay(isFocused: false, html: html, isEditable: true))

        let window = NSWindow(contentRect: container.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = container
        window.makeKeyAndOrderFront(nil)
        container.updateLinkHintOverlay(visible: true)
        container.layoutSubtreeIfNeeded()
        XCTAssertTrue(DescriptionLinkKeyboard.linkDigitHintsActiveInKeyWindow())

        addTeardownBlock { window.close() }
        return (model, router)
    }

    private func keyDown(_ character: String, modifiers: NSEvent.ModifierFlags = []) throws -> NSEvent {
        try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: modifiers,
            timestamp: 0, windowNumber: 0, context: nil, characters: character,
            charactersIgnoringModifiers: character, isARepeat: false, keyCode: 0))
    }
}
