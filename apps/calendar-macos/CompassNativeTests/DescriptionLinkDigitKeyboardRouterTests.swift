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
        let fixture = try DescriptionLinkHintKeyWindowFixture.makeBlurredDescriptionLinkHints(
            html: html,
            resetKey: "demo-morning-standup"
        )
        XCTAssertTrue(DescriptionLinkKeyboard.linkDigitHintsActiveInKeyWindow())
        addTeardownBlock { fixture.window.close() }
        return (model, router)
    }

    private func keyDown(_ character: String, modifiers: NSEvent.ModifierFlags = []) throws -> NSEvent {
        try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: modifiers,
            timestamp: 0, windowNumber: 0, context: nil, characters: character,
            charactersIgnoringModifiers: character, isARepeat: false, keyCode: 0))
    }
}
