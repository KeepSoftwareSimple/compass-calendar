import XCTest
@testable import CompassKit

final class EventFormLayoutSnapshotTests: XCTestCase {
    func testCreateFormLayoutSnapshotMatchesFixture() throws {
        let registry = try ShortcutRegistry()
        let snapshot = EventFormLayoutSnapshotBuilder.build(
            mode: "create",
            registryRows: registry.editSequenceFields
        )
        let visible = snapshot.fields.filter(\.visible).map(\.field)
        XCTAssertEqual(
            visible,
            ["title", "start", "end", "calendar", "color", "recurrence", "actions"]
        )
        XCTAssertEqual(snapshot.fields.first(where: { $0.field == "title" })?.digit, "1")
        XCTAssertEqual(
            snapshot.fields.first(where: { $0.field == "actions" })?.accessibilityId,
            "compass-event-form-actions"
        )
    }
}
