import CompassKit
import XCTest

final class CityTimezoneSearchTests: XCTestCase {
    func testTampaResolvesEastern() {
        let summer = ISO8601DateFormatter().date(from: "2026-07-15T12:00:00Z")!
        let hits = CityTimezoneSearch.search(query: "tampa", at: summer)
        XCTAssertTrue(hits.contains { $0.iana == "America/New_York" })
        XCTAssertTrue(hits.first?.title.localizedCaseInsensitiveContains("Tampa") == true)
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
