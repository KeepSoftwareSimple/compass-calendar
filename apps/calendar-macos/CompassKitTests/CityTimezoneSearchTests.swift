import XCTest
@testable import CompassKit

final class CityTimezoneSearchTests: XCTestCase {
    func testDecodeIndexRowsSkipsPoisonedEntries() throws {
        let url = try XCTUnwrap(
            Bundle(for: CityTimezoneSearchTests.self).url(
                forResource: "city-timezone-index-poisoned",
                withExtension: "json",
                subdirectory: "Fixtures"))
        let data = try Data(contentsOf: url)
        let rows = CityTimezoneSearch.decodeIndexRows(from: data)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].city, "Tampa")
        XCTAssertEqual(rows[0].iana, "America/New_York")
    }

    func testTampaResolvesEastern() {
        let summer = ISO8601DateFormatter().date(from: "2026-07-15T12:00:00Z")!
        let hits = CityTimezoneSearch.search(query: "tampa", at: summer)
        XCTAssertTrue(hits.contains { $0.iana == "America/New_York" })
        XCTAssertTrue(hits.first?.title.localizedCaseInsensitiveContains("Tampa") == true)
    }

    func testTampaAbbreviationReflectsDst() throws {
        let winter = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-01-15T18:00:00Z"))
        let summer = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-07-15T18:00:00Z"))
        let winterHit = try XCTUnwrap(
            CityTimezoneSearch.search(query: "tampa", at: winter).first { $0.iana == "America/New_York" })
        let summerHit = try XCTUnwrap(
            CityTimezoneSearch.search(query: "tampa", at: summer).first { $0.iana == "America/New_York" })
        XCTAssertTrue(winterHit.subtitle.localizedCaseInsensitiveContains("EST")
            || winterHit.subtitle.contains("GMT-5"))
        XCTAssertTrue(summerHit.subtitle.localizedCaseInsensitiveContains("EDT")
            || summerHit.subtitle.contains("GMT-4"))
    }

    func testFloridaSurfacesMultipleZones() {
        let hits = CityTimezoneSearch.search(query: "florida")
        let zones = Set(hits.map(\.iana))
        XCTAssertTrue(zones.contains("America/New_York"))
        XCTAssertTrue(zones.contains("America/Chicago"))
        XCTAssertTrue(hits.first?.subtitle.contains("multiple time zones") == true)
    }

    func testEmptyQueryUsesIanaBrowse() {
        let results = CityTimezoneSearch.filterZones(
            query: "",
            zones: ["America/Chicago", "America/New_York"])
        XCTAssertEqual(results.count, 2)
    }
}
