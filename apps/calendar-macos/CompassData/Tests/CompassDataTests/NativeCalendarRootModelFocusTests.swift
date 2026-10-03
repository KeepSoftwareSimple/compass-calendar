import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelFocusTests: XCTestCase {
    func testFocusGridEventSetsDemoStandupAccessibilityLabel() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(fixture: fixture)
        let model = NativeCalendarRootModel(environment: environment, demoSeed: fixture)
        await model.start()

        model.focusGridEvent(eventId: "demo-morning-standup")

        XCTAssertEqual(model.timeGridState.focusedEventId, "demo-morning-standup")
        XCTAssertEqual(model.gridFocusAccessibilityLabel, "Morning standup")
    }
}
