import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelFocusTests: XCTestCase {
    func testFocusGridEventSetsDemoStandupAccessibilityLabel() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()

        model.focusGridEvent(eventId: "demo-morning-standup")

        XCTAssertEqual(model.timeGridState.focusedEventId, "demo-morning-standup")
        XCTAssertEqual(model.gridFocusAccessibilityLabel, "Morning standup")
    }

    func testEditFocusNextDoesNotSeedWhenFocusNotInLayoutCards() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()

        model.updateContentTrackWidth(400)
        model.focusGridEvent(eventId: "demo-morning-standup")
        model.handleShortcut(.editFocusNext)

        XCTAssertEqual(model.gridFocusAccessibilityLabel, "Morning standup")
    }

    func testEditFocusNextMovesFromStandupToTryCompass() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()

        model.focusGridEvent(eventId: "demo-morning-standup")
        model.handleShortcut(.editFocusNext)

        XCTAssertEqual(model.gridFocusAccessibilityLabel, "Try Compass")
        XCTAssertEqual(model.timeGridState.focusedEventId, "000000000000000067653e8e")
    }

    func testShowPointerHintForEventCardKeepsFocusedGridEventLabel() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()

        model.focusGridEvent(eventId: "demo-morning-standup")
        model.showPointerHint(for: .eventCard, registry: model.shortcutRegistry)

        XCTAssertTrue(model.pointerHintStore.isVisible)
        XCTAssertEqual(model.pointerHintStore.focusedGridEventLabel, "Morning standup")
    }
}
