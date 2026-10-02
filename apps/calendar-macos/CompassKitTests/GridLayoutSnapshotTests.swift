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

private func XCTAssertJSONEqual(
    _ actual: Any?,
    _ expected: Any?,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    if !jsonEquals(actual, expected) {
        XCTFail(
            """
            \(message())
            expected: \(jsonString(expected))
            actual:   \(jsonString(actual))
            """,
            file: file,
            line: line
        )
    }
}

private func jsonEquals(_ lhs: Any?, _ rhs: Any?) -> Bool {
    if lhs is NSNull, rhs is NSNull {
        return true
    }
    switch (lhs, rhs) {
    case let (left as Double, right as Double):
        return abs(left - right) < 0.000_1
    case let (left as Int, right as Int):
        return left == right
    case let (left as Bool, right as Bool):
        return left == right
    case let (left as String, right as String):
        return left == right
    case let (left as [Any?], right as [Any?]):
        guard left.count == right.count else { return false }
        for (l, r) in zip(left, right) {
            if !jsonEquals(l, r) { return false }
        }
        return true
    case let (left as [Any], right as [Any]):
        return jsonEquals(left as [Any?], right as [Any?])
    case let (left as [String: Any?], right as [String: Any?]):
        guard left.keys.sorted() == right.keys.sorted() else { return false }
        for key in left.keys {
            if !jsonEquals(left[key] ?? NSNull(), right[key] ?? NSNull()) {
                return false
            }
        }
        return true
    case let (left as [String: Any], right as [String: Any]):
        return jsonEquals(left as [String: Any?], right as [String: Any?])
    default:
        return false
    }
}

private func jsonString(_ value: Any?) -> String {
    guard JSONSerialization.isValidJSONObject(value ?? NSNull()) else {
        return String(describing: value)
    }
    let data = try! JSONSerialization.data(withJSONObject: value ?? NSNull(), options: [.sortedKeys])
    return String(data: data, encoding: .utf8) ?? ""
}
