import CompassKit
import XCTest

final class MergeBlockingCalendarsTests: XCTestCase {
    private let google = "000000000000000000000001"
    private let microsoft = "000000000000000000000002"
    private let local = "000000000000000000000003"

    func testAddsDiscoveredCalendar() {
        XCTAssertEqual(
            MergeBlockingCalendars.mergeDiscoveredBlockingCalendarIds(
                current: [google],
                optedOut: [],
                discovered: [google, microsoft]
            ),
            [google, microsoft]
        )
    }

    func testRespectsOptOut() {
        XCTAssertEqual(
            MergeBlockingCalendars.mergeDiscoveredBlockingCalendarIds(
                current: [google],
                optedOut: [microsoft],
                discovered: [google, microsoft, local]
            ),
            [google, local]
        )
    }

    func testDoesNotDuplicate() {
        XCTAssertEqual(
            MergeBlockingCalendars.mergeDiscoveredBlockingCalendarIds(
                current: [google, microsoft],
                optedOut: [],
                discovered: [microsoft, google]
            ),
            [google, microsoft]
        )
    }

    func testNextOptedOutRecordsUnchecked() {
        XCTAssertEqual(
            MergeBlockingCalendars.nextOptedOutBlockingCalendarIds(
                previousOptedOut: [],
                eligible: [google, microsoft],
                submitted: [google]
            ),
            [microsoft]
        )
    }

    func testWithDiscoveredReturnsNilWhenUnchanged() {
        XCTAssertNil(
            MergeBlockingCalendars.withDiscoveredBlockingCalendarIds(
                blockingCalendarIds: [google],
                optedOut: [],
                discovered: [google]
            )
        )
    }

    func testWithDiscoveredReturnsMergedWhenChanged() {
        XCTAssertEqual(
            MergeBlockingCalendars.withDiscoveredBlockingCalendarIds(
                blockingCalendarIds: [google],
                optedOut: [],
                discovered: [google, microsoft]
            ),
            [google, microsoft]
        )
    }
}
