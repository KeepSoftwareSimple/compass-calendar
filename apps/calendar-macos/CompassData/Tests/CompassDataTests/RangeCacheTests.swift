import CompassData
import XCTest

final class RangeCacheTests: XCTestCase {
    func testIntervalCoverageMath() {
        XCTAssertTrue(
            RangeCache.intervalCovers(
                storedStart: "2026-01-01T00:00:00.000Z",
                storedEnd: "2026-01-08T00:00:00.000Z",
                requestStart: "2026-01-02T00:00:00.000Z",
                requestEnd: "2026-01-03T00:00:00.000Z"
            )
        )
        XCTAssertFalse(
            RangeCache.intervalCovers(
                storedStart: "2026-01-01T00:00:00.000Z",
                storedEnd: "2026-01-02T00:00:00.000Z",
                requestStart: "2026-01-01T00:00:00.000Z",
                requestEnd: "2026-01-08T00:00:00.000Z"
            )
        )
    }

    func testFreshAndStaleCoverage() throws {
        let database = try AppDatabase.inMemory()
        let fixedNow = Date(timeIntervalSince1970: 1_000_000)
        let cache = RangeCache(
            database: database,
            staleInterval: 120,
            now: { fixedNow }
        )
        let key = EventRangeQueryKey(
            scope: .week,
            source: .remote,
            start: "2026-01-01T00:00:00.000Z",
            end: "2026-01-08T00:00:00.000Z"
        )

        XCTAssertEqual(try cache.coverage(for: key), .missing)

        try cache.markLoaded(key: key, fetchedAt: fixedNow.addingTimeInterval(-60))
        XCTAssertEqual(
            try cache.coverage(for: key),
            .fresh(fetchedAt: fixedNow.addingTimeInterval(-60))
        )

        try cache.markLoaded(key: key, fetchedAt: fixedNow.addingTimeInterval(-300))
        XCTAssertEqual(
            try cache.coverage(for: key),
            .stale(fetchedAt: fixedNow.addingTimeInterval(-300))
        )
    }

    func testEventInvalidationClearsLoadedRanges() throws {
        let database = try AppDatabase.inMemory()
        let cache = RangeCache(database: database)
        let key = EventRangeQueryKey(
            scope: .day,
            source: .local,
            start: "a",
            end: "b"
        )
        try cache.markLoaded(key: key)
        try QueryInvalidator.apply([.events], rangeCache: cache)
        XCTAssertEqual(try cache.coverage(for: key), .missing)
    }
}
