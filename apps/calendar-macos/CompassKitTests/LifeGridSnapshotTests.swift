import Foundation
import XCTest
@testable import CompassKit

final class LifeGridSnapshotTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EffectiveTimeZone.identifier = "UTC"
    }

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
            let today = try XCTUnwrap(CompassDateParsing.parseInEffectiveTimeZone(todayString))

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

    private func snapshotDictionary(_ snapshot: LifeGridSnapshot) throws -> Any {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(snapshot)
        return try JSONSerialization.jsonObject(with: data)
    }
}
