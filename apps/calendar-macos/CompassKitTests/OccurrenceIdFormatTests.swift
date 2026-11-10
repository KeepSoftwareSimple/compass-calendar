import CompassKit
import XCTest

final class OccurrenceIdFormatTests: XCTestCase {
    private let eventId = "664e21f9a6b3f0b1c2d3e4f5"
    private let recurrenceId = "2026-07-06T16:00:00.000Z"

    func testSeparatorMatchesTheSharedCodec() {
        // `packages/core/src/util/occurrence-id.ts` owns this format.
        XCTAssertEqual(OccurrenceIdFormat.separator, "::")
    }

    func testComposesTheAppFacingOccurrenceId() {
        XCTAssertEqual(
            OccurrenceIdFormat.compose(eventId: eventId, recurrenceId: recurrenceId),
            "664e21f9a6b3f0b1c2d3e4f5::2026-07-06T16:00:00.000Z"
        )
    }

    func testDecodesTheRecurrenceIdOfACompositeId() {
        XCTAssertEqual(
            OccurrenceIdFormat.recurrenceId(of: "664e21f9a6b3f0b1c2d3e4f5::2026-07-06T16:00:00.000Z"),
            recurrenceId
        )
    }

    func testPlainEventIdCarriesNoRecurrenceId() {
        XCTAssertNil(OccurrenceIdFormat.recurrenceId(of: eventId))
    }

    func testDemoSeededLocalIdIsNotACompositeOccurrenceId() {
        XCTAssertNil(OccurrenceIdFormat.recurrenceId(of: "demo-weekly-sync|2026-06-12T14:00:00.000Z"))
    }

    func testNestedLocalSplitIdIsRejectedRatherThanGuessed() {
        XCTAssertNil(
            OccurrenceIdFormat.recurrenceId(
                of: "664e21f9a6b3f0b1c2d3e4f5::2026-07-06T16:00:00.000Z::2026-07-13T16:00:00.000Z"
            )
        )
    }

    func testMalformedRecurrenceIdIsRejected() {
        XCTAssertNil(OccurrenceIdFormat.recurrenceId(of: "664e21f9a6b3f0b1c2d3e4f5::not-a-datetime"))
    }

    // The remainder-master id is derived independently here (CryptoKit) and in
    // `packages/core/src/util/series-split.ts` (a hand-rolled SHA-256, so the
    // browser bundle carries no crypto polyfill). Both sides pin this vector,
    // so a change to either implementation cannot silently desync macOS from
    // the server and fork a thisAndFollowing split into two remainder masters.
    func testRemainderMasterIdMatchesTheSharedVector() {
        XCTAssertEqual(
            SeriesSplit.remainderMasterId(
                seriesId: EventId(rawValue: "65b80e635088efa5d8477a66"),
                splitAt: "2026-11-12T00:00:00.000Z"
            ),
            EventId(rawValue: "c41b923eedccbca418a541da")
        )
    }
}
