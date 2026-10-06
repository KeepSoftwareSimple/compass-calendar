import CompassData
import CompassKit
import XCTest

@MainActor
final class NativeCalendarRootModelUndoTests: XCTestCase {
    func testUndoCreateRemovesKeyboardPlacedEvent() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.updateContentTrackWidth(400)

        XCTAssertTrue(
            model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        await model.saveDraft()
        XCTAssertTrue(model.undoStore.canUndo)

        let widths = model.timeGridState.resolvedColumnWidths()
        let untitledCards = {
            model.timeGridState.snapshot(colWidths: widths).cards.filter { $0.label == "Untitled event" }
        }
        XCTAssertEqual(untitledCards().count, 1)

        model.undoLastChange()
        for _ in 0 ..< 40 {
            try await Task.sleep(for: .milliseconds(50))
            if untitledCards().isEmpty { break }
        }
        XCTAssertTrue(untitledCards().isEmpty)
    }

    func testSyncKeyboardPlaceSaveAndUndo() async throws {
        let fixture = try DemoSeedFixture.load()
        let environment = try NativeCalendarEnvironment(inMemoryDatabase: true)
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: fixture)
        await model.start()
        model.updateContentTrackWidth(400)

        XCTAssertTrue(
            model.nudgeDraftOrPlace(key: "ArrowDown", shiftKey: true, altKey: false))
        model.saveKeyboardPlacedDraftNow()
        XCTAssertTrue(model.undoStore.canUndo)

        let widths = model.timeGridState.resolvedColumnWidths()
        let untitledCards = {
            model.timeGridState.snapshot(colWidths: widths).cards.filter { $0.label == "Untitled event" }
        }
        XCTAssertEqual(untitledCards().count, 1)

        model.undoKeyboardPlacedCreateNow()
        XCTAssertTrue(untitledCards().isEmpty)
        XCTAssertNil(model.gridFocusAccessibilityLabel)
    }
}
