import Foundation
import XCTest
@testable import CompassKit

final class LifeGridSnapshotTests: XCTestCase {
    func testLifeGridSnapshotsMatchExportedFixtures() throws {
        let url = try XCTUnwrap(
            CompassKitResourceBundle.resources.url(
                forResource: "life-grid.snapshots",
                withExtension: "json",
                subdirectory: "Fixtures"))
        let data = try Data(contentsOf: url)
        let document = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let scenarios = try XCTUnwrap(document?["scenarios"] as? [[String: Any]])

        for row in scenarios {
            let scenario = try XCTUnwrap(row["scenario"] as? [String: Any])
            let expected = try XCTUnwrap(row["snapshot"] as? [String: Any])
            let birthDate = try XCTUnwrap(scenario["birthDate"] as? String)
            let lifespan = try XCTUnwrap(scenario["lifespan"] as? Int)
            let todayString = try XCTUnwrap(scenario["today"] as? String)
            let showCurrentWeek = try XCTUnwrap(scenario["showCurrentWeek"] as? Bool)
            let today = try XCTUnwrap(isoDate(todayString))

            let built = LifeGridSnapshotBuilder.build(
                birthDate: birthDate,
                lifespan: lifespan,
                today: today,
                showCurrentWeek: showCurrentWeek)
            let builtJSON = try snapshotDictionary(built)
            XCTAssertEqual(
                builtJSON as? NSDictionary,
                expected as NSDictionary,
                scenario["id"] as? String ?? "scenario")
        }
    }

    private func isoDate(_ value: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return try XCTUnwrap(formatter.date(from: value))
    }

    private func snapshotDictionary(_ snapshot: LifeGridSnapshot) throws -> Any {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(snapshot)
        return try JSONSerialization.jsonObject(with: data)
    }
}
