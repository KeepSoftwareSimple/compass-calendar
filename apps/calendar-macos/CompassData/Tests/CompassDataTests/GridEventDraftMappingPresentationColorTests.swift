import CompassData
import CompassKit
import XCTest

final class GridEventDraftMappingPresentationColorTests: XCTestCase {
    func testPresentationColorHexResolvesCoralSlot() {
        let draft = GridEventDraft(
            kind: .create,
            clientId: GridEventDraftFactory.makeClientEventId(),
            schedule: DraftSchedule(start: Date(), end: Date().addingTimeInterval(3600), kind: .timed),
            title: "Colored",
            color: EventColorSlot(rawValue: ColorEnum.coral.rawValue)
        )
        let hex = GridEventDraftMapping.presentationColorHex(draft: draft, sourceColorHex: nil)
        XCTAssertEqual(hex, EventColorSlotHex.hex(for: .coral))
    }
}
