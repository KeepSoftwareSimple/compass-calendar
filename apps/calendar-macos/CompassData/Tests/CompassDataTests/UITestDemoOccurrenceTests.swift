import CompassData
import CompassKit
import XCTest

final class UITestDemoOccurrenceTests: XCTestCase {
    func testAppendOccurrenceIsRecurringOccurrenceForScopeAsk() throws {
        let fixture = try DemoSeedFixture.load()
        let record = try UITestDemoOccurrence.localRecord(calendarId: fixture.calendarId)
        if case .occurrence(let payload) = record.event.recurrence {
            XCTAssertEqual(payload.seriesId.rawValue, "demo-weekly-sync")
        } else {
            XCTFail("Expected occurrence recurrence")
        }
        XCTAssertTrue(
            EventInteractionPolicy.isOccurrenceThisScopeAsk(event: record.event, scope: .this))
    }
}
