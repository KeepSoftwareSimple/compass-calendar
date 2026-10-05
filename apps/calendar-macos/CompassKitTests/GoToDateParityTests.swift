import Foundation
import XCTest
@testable import CompassKit

final class GoToDateParityTests: XCTestCase {
    func testGoToDateVectors() throws {
        let cases = try loadVectorCases(named: "go-to-date.vectors")
        for vectorCase in cases {
            let id = vectorCase["id"] as? String ?? "unknown"
            let input = try XCTUnwrap(vectorCase["input"] as? [String: Any])
            let output = try XCTUnwrap(vectorCase["output"] as? [String: Any])

            if id.hasPrefix("parse-") {
                let text = input["text"] as? String ?? ""
                let nowISO = input["now"] as? String ?? ""
                let now = try XCTUnwrap(isoDate(nowISO), "now for \(id)")
                let parsed = UserDateParsing.parseUserDate(text, now: now)
                if let expected = output["expected"] as? String {
                    let ymd = parsed.map { CompassDateParsing.formatCalendarDay($0) }
                    XCTAssertEqual(ymd, expected, id)
                } else {
                    XCTAssertNil(parsed, id)
                }
                continue
            }

            if id == "announcements" {
                let dateYMD = input["date"] as? String ?? ""
                let date = try XCTUnwrap(CompassDateParsing.calendarDateInEffectiveTimeZone(dateYMD))
                XCTAssertEqual(
                    UserDateParsing.goToDatePaletteLabel(date),
                    output["paletteLabel"] as? String)
                XCTAssertEqual(
                    UserDateParsing.goToDateAnnouncement(date, view: .day),
                    output["day"] as? String)
                XCTAssertEqual(
                    UserDateParsing.goToDateAnnouncement(date, view: .week),
                    output["week"] as? String)
                XCTAssertEqual(
                    UserDateParsing.goToDateAnnouncement(date, view: .life),
                    output["life"] as? String)
            }
        }
    }

    private func loadVectorCases(named name: String) throws -> [[String: Any]] {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: name))
        let data = try Data(contentsOf: url)
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return try XCTUnwrap(root?["cases"] as? [[String: Any]])
    }

    private func isoDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
