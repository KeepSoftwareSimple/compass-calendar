import AppKit
import CompassData
import CompassKit
import XCTest

@MainActor
final class FocusedEventShiftArrowKeyboardTests: XCTestCase {
    func testRouterShiftArrowDownNudgesFocusedStartEdge() async throws {
        _ = NSApplication.shared
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.updateContentTrackWidth(800)

        let eventId = EventId(rawValue: "demo-morning-standup")
        let before = try XCTUnwrap(model.event(for: eventId))
        guard case .timed(let timedBefore) = before.schedule else {
            return XCTFail("Expected demo standup to be timed")
        }

        model.focusEvent(eventId: eventId.rawValue)
        model.focusStore.setEdge(
            eventId: eventId,
            edge: .startDate,
            announcement: "Editing start time",
            isAllDay: false
        )

        let router = NativeGridKeyboardRouter(model: model, registry: try ShortcutRegistry())
        let keyDown = try XCTUnwrap(
            NSEvent.keyEvent(
                with: .keyDown,
                location: .zero,
                modifierFlags: .shift,
                timestamp: 0,
                windowNumber: 0,
                context: nil,
                characters: "",
                charactersIgnoringModifiers: "",
                isARepeat: false,
                keyCode: 125
            )
        )
        XCTAssertTrue(router.handleKeyDown(keyDown))

        let after = try XCTUnwrap(model.event(for: eventId))
        guard case .timed(let timedAfter) = after.schedule else {
            return XCTFail("Expected timed schedule after nudge")
        }
        XCTAssertNotEqual(timedAfter.start.rawValue, timedBefore.start.rawValue)
        XCTAssertEqual(timedAfter.end.rawValue, timedBefore.end.rawValue)
    }
}
