import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelEventPastePreviewTests: XCTestCase {
    func testCopyFocusedEventActivatesPastePreview() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first {
            if case .details(let details) = $0.content { return !details.title.isEmpty }
            return false
        })
        model.focusEvent(eventId: event.id.rawValue)

        model.copyFocusedEvent()

        XCTAssertTrue(model.pastePreviewStore.isActive)
        XCTAssertNotNil(model.eventPastePreviewStatusText)
        XCTAssertNotNil(model.timeGridState.scenario.draftOverlay)
    }

    func testEscapeEndsPastePreviewWithoutClearingClipboard() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.viewStore.view = .week
        let event = try XCTUnwrap(model.loadedEvents.first)
        model.focusEvent(eventId: event.id.rawValue)
        model.copyFocusedEvent()

        model.endEventPastePreview()

        XCTAssertFalse(model.pastePreviewStore.isActive)
        XCTAssertNotNil(model.clipboardStore.event)
        XCTAssertNil(model.timeGridState.scenario.draftOverlay)
    }
}
