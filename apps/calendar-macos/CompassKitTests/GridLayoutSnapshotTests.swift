import Foundation
import XCTest
@testable import CompassKit

final class GridLayoutSnapshotTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EffectiveTimeZone.identifier = "UTC"
    }

    func testGridLayoutSnapshotsMatchExportedFixtures() throws {
        let document = try loadSnapshotDocument()
        let scenarios = try XCTUnwrap(document["scenarios"] as? [[String: Any]])

        for scenario in scenarios {
            let id = try XCTUnwrap(scenario["id"] as? String)
            guard id.hasPrefix("grid-layout-"), id != "grid-layout-day-mode" else { continue }

            let input = try XCTUnwrap(scenario["input"] as? [String: Any])
            let expected = try XCTUnwrap(scenario["output"])

            let colWidths = try XCTUnwrap(input["colWidths"] as? [Double])
            let visibleDateKeys = try XCTUnwrap(input["visibleDateKeys"] as? [String])
            let layoutModeRaw = try XCTUnwrap(input["layoutMode"] as? String)
            let layoutMode = GridLayoutMode(rawValue: layoutModeRaw) ?? .week

            let built = GridLayoutSnapshotBuilder.build(
                scenario: GridLayoutSnapshotFixtures.parityScenario(
                    layoutMode: layoutMode,
                    visibleDateKeys: visibleDateKeys
                ),
                colWidths: colWidths
            )

            let actual = try snapshotDictionary(built)
            XCTAssertJSONEqual(actual, expected, "grid layout snapshot \(id)")
        }
    }

    func testDayViewUsesOneColumnPerVisibleCalendar() throws {
        let built = GridLayoutSnapshotBuilder.build(
            scenario: GridLayoutSnapshotFixtures.parityScenario(
                layoutMode: .day,
                visibleDateKeys: ["2026-05-20"]
            ),
            colWidths: [320, 320]
        )

        XCTAssertEqual(built.layoutMode, .day)
        XCTAssertEqual(built.columns.count, 2)
        XCTAssertEqual(built.columns[0].key, "507f1f77bcf86cd799439011")
        XCTAssertEqual(built.columns[1].key, "507f1f77bcf86cd799439012")
    }

    private func loadSnapshotDocument() throws -> [String: Any] {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: "grid-layout.snapshots"))
        let data = try Data(contentsOf: url)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    private func snapshotDictionary(_ snapshot: GridLayoutSnapshot) throws -> Any {
        let data = try JSONEncoder().encode(snapshot)
        return try JSONSerialization.jsonObject(with: data)
    }
}
