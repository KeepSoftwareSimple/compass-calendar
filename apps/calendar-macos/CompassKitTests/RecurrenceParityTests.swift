import Foundation
import XCTest
@testable import CompassKit

final class RecurrenceParityTests: XCTestCase {
    func testRRuleVectors() throws {
        let cases = try loadVectorCases(named: "rrule.vectors")
        for vectorCase in cases {
            let id = vectorCase["id"] as? String ?? "unknown"
            let input = try XCTUnwrap(vectorCase["input"] as? [String: Any])
            let output = try XCTUnwrap(vectorCase["output"] as? [String: Any])

            let startDate = input["startDate"] as? String ?? ""
            let endDate = input["endDate"] as? String ?? ""
            let recurrenceRule = input["recurrenceRule"] as? String ?? ""
            let timeZone = input["timeZone"] as? String ?? "UTC"
            let firstN = input["firstN"] as? Int ?? 5

            let rule = try XCTUnwrap(
                RecurrenceRule(
                    startDateISO: startDate,
                    endDateISO: endDate,
                    recurrenceRule: recurrenceRule,
                    timeZoneIdentifier: timeZone
                ),
                "RecurrenceRule init failed for \(id)"
            )

            let expectedSummary = output["summary"] as? String ?? ""
            XCTAssertEqual(rule.summary(), expectedSummary, "summary mismatch for \(id)")

            let expectedInstances = output["instances"] as? [String] ?? []
            let actualInstances = rule.all(limit: firstN).map { iso8601UTC($0) }
            XCTAssertEqual(actualInstances, expectedInstances, "instances mismatch for \(id)")
        }
    }

    func testOccurrencesFromStartRespectsLimit() throws {
        let rule = try XCTUnwrap(
            RecurrenceRule(
                startDateISO: "2026-01-01T10:00:00.000Z",
                endDateISO: "2026-01-01T11:00:00.000Z",
                recurrenceRule: "RRULE:FREQ=DAILY;COUNT=3",
                timeZoneIdentifier: "UTC"
            )
        )
        let from = try XCTUnwrap(iso8601UTCDate("2026-01-02T10:00:00.000Z"))
        let instances = rule.occurrences(from: from, limit: 5).map { iso8601UTC($0) }
        XCTAssertEqual(instances, [
            "2026-01-02T10:00:00.000Z",
            "2026-01-03T10:00:00.000Z",
        ])
    }

    private func loadVectorCases(named name: String) throws -> [[String: Any]] {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: name))
        let data = try Data(contentsOf: url)
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return try XCTUnwrap(root?["cases"] as? [[String: Any]])
    }

    private func iso8601UTC(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }

    private func iso8601UTCDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        if let date = formatter.date(from: value) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
